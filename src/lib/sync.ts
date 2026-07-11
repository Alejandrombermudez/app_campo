import { db } from '../db/schema'
import { supabase, evalTable } from './supabase'
import type { PhotoRecord, ZonaData, EvaluacionRecord } from '../types/evaluacion'
import type { CultivoRow, EncuestaPredialRecord } from '../types/encuesta'

function encTable()     { return supabase.schema('siembra').from('familias') }
function predioTable()  { return supabase.schema('siembra').from('evaluaciones_campo') }

// ─── Predio de práctica (capacitación): nunca debe tocar Supabase ────────────
// Los registros ligados a una familia es_practica se marcan 'synced' local-
// mente (para que el flujo de "pendiente → sincronizado" se vea completo en
// la capacitación) sin llamar jamás a la red.
async function esFamiliaDePractica(familiaLocalId: string | null | undefined): Promise<boolean> {
  if (!familiaLocalId) return false
  const fam = await db.familias.where('local_id').equals(familiaLocalId).first()
  return fam?.es_practica === true
}

// ─── Helpers de merge colaborativo ────────────────────────────────────────────

/** Local wins: toma remote como base, aplica local solo para campos no vacíos */
function mergeJsonb(
  remote: Record<string, unknown>,
  local:  Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...remote }
  for (const [k, v] of Object.entries(local)) {
    const isEmpty = v === null || v === undefined || v === ''
      || (Array.isArray(v) && v.length === 0)
    if (!isEmpty) result[k] = v
  }
  return result
}

/** Identidad de una zona: zona_id (geo.zonas real) o, en registros legacy sin zona_id, zona_numero */
function zonaKey(z: ZonaData): string { return z.zona_id ?? `n${z.zona_numero}` }

/** Mergea zonas por zona_id (identidad real del SIG; zona_numero solo ordena) */
function mergeZonas(remote: ZonaData[], local: ZonaData[]): ZonaData[] {
  const result = remote.map(rz => {
    const lz = local.find(z => zonaKey(z) === zonaKey(rz))
    if (!lz) return rz
    return {
      ...rz,
      cobertura: mergeJsonb(
        (rz.cobertura ?? {}) as Record<string, unknown>,
        (lz.cobertura ?? {}) as Record<string, unknown>,
      ) as ZonaData['cobertura'],
      suelo: mergeJsonb(
        (rz.suelo     ?? {}) as Record<string, unknown>,
        (lz.suelo     ?? {}) as Record<string, unknown>,
      ) as ZonaData['suelo'],
      logistica: mergeJsonb(
        (rz.logistica ?? {}) as Record<string, unknown>,
        (lz.logistica ?? {}) as Record<string, unknown>,
      ) as ZonaData['logistica'],
    }
  })
  // Zonas locales que no existen aún en remote
  for (const lz of local) {
    if (!result.find(z => zonaKey(z) === zonaKey(lz))) result.push(lz)
  }
  return result
}

/** Mergea cultivos por nombre de cultivo */
function mergeCultivos(remote: CultivoRow[], local: CultivoRow[]): CultivoRow[] {
  const result = [...remote]
  for (const lc of local) {
    const idx = result.findIndex(r => r.cultivo === lc.cultivo)
    const nonEmpty = Object.fromEntries(
      Object.entries(lc).filter(([, v]) => v !== null && v !== undefined && v !== ''),
    )
    if (idx >= 0) result[idx] = { ...result[idx], ...nonEmpty }
    else result.push(lc)
  }
  return result
}

// ─── Subir una foto al bucket campo-fotos ────────────────────────────────────
async function uploadPhoto(photo: PhotoRecord, localId: string): Promise<string | null> {
  const ext = photo.mime_type.includes('png') ? 'png' : 'jpg'
  const path = `${localId}/${photo.field_key}.${ext}`

  const { error } = await supabase.storage
    .from('campo-fotos')
    .upload(path, photo.blob, { contentType: photo.mime_type, upsert: true })

  if (error) { console.error('upload photo error', error); return null }

  const { data } = supabase.storage.from('campo-fotos').getPublicUrl(path)
  return data.publicUrl
}

// ─── Convertir firma dataURL → Blob ──────────────────────────────────────────
function dataURLtoBlob(dataURL: string): Blob {
  const [header, data] = dataURL.split(',')
  const mime = header.match(/:(.*?);/)?.[1] ?? 'image/png'
  const binary = atob(data)
  const arr = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// ─── Subir firma (dataURL) al bucket ─────────────────────────────────────────
async function uploadSignature(dataURL: string, localId: string, role: string): Promise<string | null> {
  if (!dataURL) return null
  const blob = dataURLtoBlob(dataURL)
  const path = `${localId}/firma_${role}.png`

  const { error } = await supabase.storage
    .from('campo-fotos')
    .upload(path, blob, { contentType: 'image/png', upsert: true })

  if (error) { console.error('upload signature error', error); return null }

  const { data } = supabase.storage.from('campo-fotos').getPublicUrl(path)
  return data.publicUrl
}

// ─── Sincronizar revisiones de zonas (SIG II) → RPC geo.revisar_zona ─────────
// Idempotente: el RPC ignora local_id repetidos, así que reintentar es seguro.
export async function syncPendingRevisiones(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) return { synced: 0, errors: 0 }

  const pending = await db.revisiones
    .where('sync_status').anyOf(['pending', 'error'])
    .toArray()

  let synced = 0, errors = 0
  const familiasTocadas = new Set<string>()

  for (const rev of pending.sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    try {
      if (await esFamiliaDePractica(rev.familia_local_id)) {
        await db.revisiones.update(rev.id!, { sync_status: 'synced', sync_error: null, updated_at: new Date().toISOString() })
        synced++
        continue
      }
      const { data: zonaId, error } = await supabase.schema('geo').rpc('revisar_zona', {
        p_local_id:      rev.local_id,
        p_predio_id:     rev.predio_core_id,
        p_accion:        rev.accion,
        p_zona_id:       rev.zona_id,
        p_geojson:       rev.geojson,
        p_observaciones: rev.observaciones || null,
        p_evaluador:     rev.created_by || null,
        p_metodo:        rev.metodo,
        p_fecha:         rev.fecha || null,
      })
      if (error) {
        const supMsg = [error.message, error.details, error.hint, error.code]
          .filter(Boolean).join(' | ')
        throw new Error(supMsg || JSON.stringify(error))
      }

      await db.revisiones.update(rev.id!, {
        sync_status: 'synced',
        sync_error:  null,
        zona_id:     rev.zona_id ?? (zonaId as string | null),
        updated_at:  new Date().toISOString(),
      })
      familiasTocadas.add(rev.familia_local_id)
      synced++
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' ? JSON.stringify(err) : String(err))
      console.error('[sync revision] error:', msg)
      await db.revisiones.update(rev.id!, { sync_status: 'error', sync_error: msg })
      errors++
    }
  }

  // Refrescar el snapshot de zonas de las familias afectadas: geo.zonas ya
  // tiene la versión corregida, así el estado local vuelve a ser espejo del
  // servidor y las revisiones aplicadas dejan de "sumar" sobre el snapshot.
  for (const familiaLocalId of familiasTocadas) {
    try {
      const familia = await db.familias.where('local_id').equals(familiaLocalId).first()
      if (!familia?.predio_core_id) continue
      const { fetchZonasPredio } = await import('./core')
      const { siembra, finca } = await fetchZonasPredio(familia.predio_core_id)
      await db.familias.update(familia.id!, {
        zonas_sig:   siembra,
        zonas_finca: finca,
        num_zonas:   siembra.length,
        updated_at:  new Date().toISOString(),
      })
    } catch (err) {
      console.error('[sync revision] refresh zonas error:', err)
    }
  }

  return { synced, errors }
}

// ─── Sincronizar evaluaciones pendientes → Supabase ──────────────────────────
export async function syncPendingEvaluaciones(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) return { synced: 0, errors: 0 }

  const pending = await db.evaluaciones
    .where('sync_status').anyOf(['pending', 'error'])
    .toArray()

  let synced = 0, errors = 0

  for (const ev of pending) {
    try {
      if (await esFamiliaDePractica(ev.familia_local_id)) {
        await db.evaluaciones.update(ev.id!, { sync_status: 'synced', sync_error: null, updated_at: new Date().toISOString() })
        synced++
        continue
      }

      // 1. Subir fotos pendientes de esta evaluación
      const pendingPhotos = await db.photos
        .where('local_evaluacion_id').equals(ev.local_id)
        .filter(p => p.sync_status === 'pending')
        .toArray()

      const photoUrlMap: Record<string, string> = {}
      for (const photo of pendingPhotos) {
        const url = await uploadPhoto(photo, ev.local_id)
        if (url) {
          photoUrlMap[photo.field_key] = url
          await db.photos.update(photo.id!, { sync_status: 'synced', uploaded_url: url })
        }
      }

      // 2. Recopilar URLs de fotos ya subidas
      const allPhotos = await db.photos
        .where('local_evaluacion_id').equals(ev.local_id)
        .toArray()
      for (const p of allPhotos) {
        if (p.uploaded_url) photoUrlMap[p.field_key] = p.uploaded_url
      }

      // 3. Subir firmas
      const f7 = ev.seccion_7 ?? {}
      const firma_eval1_url  = f7.firma_evaluador1_dataurl  ? await uploadSignature(f7.firma_evaluador1_dataurl,  ev.local_id, 'eval1')  : null
      const firma_eval2_url  = f7.firma_evaluador2_dataurl  ? await uploadSignature(f7.firma_evaluador2_dataurl,  ev.local_id, 'eval2')  : null
      const firma_prop_url   = f7.firma_propietario_dataurl ? await uploadSignature(f7.firma_propietario_dataurl, ev.local_id, 'propietario') : null

      // 4. Sustituir IDs de fotos por URLs en las zonas
      let zonas_data = ev.zonas.map(zona => {
        const zn = zona.zona_numero
        const s  = { ...zona.suelo }  as Record<string, unknown>
        const l  = { ...zona.logistica } as Record<string, unknown>

        if (s['foto_textura_id'])   { s['foto_textura_url']   = photoUrlMap[`zona_${zn}_textura`]   ?? null; delete s['foto_textura_id']   }
        if (s['foto_drenaje_id'])   { s['foto_drenaje_url']   = photoUrlMap[`zona_${zn}_drenaje`]   ?? null; delete s['foto_drenaje_id']   }
        if (s['foto_pendiente_id']) { s['foto_pendiente_url'] = photoUrlMap[`zona_${zn}_pendiente`] ?? null; delete s['foto_pendiente_id'] }
        if (s['foto_erosion_id'])   { s['foto_erosion_url']   = photoUrlMap[`zona_${zn}_erosion`]   ?? null; delete s['foto_erosion_id']   }
        if (l['foto_via_id'])       { l['foto_via_url']       = photoUrlMap[`zona_${zn}_via`]       ?? null; delete l['foto_via_id']       }

        return { ...zona, suelo: s, logistica: l }
      })

      // 4b. Merge colaborativo: si ya existe en Supabase, combinar secciones
      // (el progreso local wins para campos no vacíos; remote conserva lo del otro colaborador)
      let seccion_1 = ev.seccion_1 as Record<string, unknown>
      let seccion_2 = ev.seccion_2 as Record<string, unknown>
      let seccion_6 = ev.seccion_6 as Record<string, unknown>

      let finalStepCompleted = ev.step_completed
      if (ev.supabase_id) {
        const { data: remote } = await evalTable()
          .select('seccion_1_data, seccion_2_data, zonas_data, seccion_6_data, step_completed')
          .eq('id', ev.supabase_id)
          .single()
        if (remote) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = remote as any
          seccion_1  = mergeJsonb(r.seccion_1_data ?? {}, seccion_1)
          seccion_2  = mergeJsonb(r.seccion_2_data ?? {}, seccion_2)
          zonas_data = mergeZonas(r.zonas_data     ?? [], zonas_data as ZonaData[]) as typeof zonas_data
          seccion_6  = mergeJsonb(r.seccion_6_data ?? {}, seccion_6)
          // step_completed: tomar el máximo entre local y remoto (nunca retroceder)
          finalStepCompleted = Math.max(ev.step_completed, r.step_completed ?? 0)
          // Actualizar Dexie local con el merged result
          await db.evaluaciones.update(ev.id!, {
            seccion_1:      seccion_1 as EvaluacionRecord['seccion_1'],
            seccion_2:      seccion_2 as EvaluacionRecord['seccion_2'],
            zonas:          zonas_data as EvaluacionRecord['zonas'],
            seccion_6:      seccion_6 as EvaluacionRecord['seccion_6'],
            step_completed: finalStepCompleted,
          })
        }
      }

      // 4c. Obtener predio_id/expediente_id (FK a core.predios/core.expedientes)
      // desde la familia local — identidad/ubicación ya no viajan como columnas
      // propias de evaluaciones_campo, se leen por JOIN contra core.
      let predio_id: string | null = null
      let expediente_id: string | null = null
      if (ev.familia_local_id) {
        const fam = await db.familias.filter(f => f.local_id === ev.familia_local_id).first()
        predio_id     = fam?.predio_core_id ?? null
        expediente_id = fam?.expediente_id  ?? null
      }

      // 5. Upsert en Supabase
      // Nota: municipio, codigo_predio y nombre_predio ya no son columnas de
      // evaluaciones_campo; se leen por JOIN a core.predios via predio_id.
      const payload = {
        local_id:       ev.local_id,
        fecha_visita:   ev.fecha_visita || null,
        num_zonas_eval: zonas_data.length,
        step_completed: finalStepCompleted,
        created_by:     ev.created_by || null,
        seccion_1_data: seccion_1,
        seccion_2_data: seccion_2,
        zonas_data,
        seccion_6_data: seccion_6,
        firma_eval1_url,
        firma_eval2_url,
        firma_prop_url,
        predio_id,
        expediente_id,
        sync_origin:    'pwa',
        updated_at:     new Date().toISOString(),
      }

      // Si el registro fue importado (supabase_id conocido) → actualizar por ID remoto.
      // Si es nuevo (creado en este dispositivo) → insertar vía upsert por local_id.
      // Esto evita crear registros duplicados cuando dos personas sincronizan el mismo predio.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { local_id: _lid, ...updatePayload } = payload
      const { data, error } = ev.supabase_id
        ? await evalTable().update(updatePayload).eq('id', ev.supabase_id).select('id').single()
        : await evalTable().upsert(payload, { onConflict: 'local_id' }).select('id').single()
      if (error) {
        // Construir mensaje legible desde el objeto de error de Supabase
        const supMsg = [error.message, error.details, error.hint, error.code]
          .filter(Boolean).join(' | ')
        throw new Error(supMsg || JSON.stringify(error))
      }

      await db.evaluaciones.update(ev.id!, {
        sync_status: 'synced',
        sync_error: null,
        supabase_id: data?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      synced++
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' ? JSON.stringify(err) : String(err))
      console.error('[sync] error:', msg)
      await db.evaluaciones.update(ev.id!, { sync_status: 'error', sync_error: msg })
      errors++
    }
  }

  return { synced, errors }
}

// ─── Sincronizar encuestas prediales pendientes → siembra.familias ────────────
export async function syncPendingEncuestas(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) return { synced: 0, errors: 0 }

  const pending = await db.encuestas
    .where('sync_status').anyOf(['pending', 'error'])
    .toArray()

  let synced = 0, errors = 0

  for (const enc of pending) {
    try {
      if (await esFamiliaDePractica(enc.familia_local_id)) {
        await db.encuestas.update(enc.id!, { sync_status: 'synced', sync_error: null, updated_at: new Date().toISOString() })
        synced++
        continue
      }

      // Merge colaborativo: combinar secciones con el estado remoto si existe
      let sec_general    = enc.sec_general    as Record<string, unknown>
      let sec_vivienda   = enc.sec_vivienda   as Record<string, unknown>
      let sec_familia    = enc.sec_familia    as Record<string, unknown>
      let sec_economia   = enc.sec_economia   as Record<string, unknown>
      let sec_cultivos   = enc.sec_cultivos
      let sec_ganaderia  = enc.sec_ganaderia  as Record<string, unknown>
      let sec_tecnologia = enc.sec_tecnologia as Record<string, unknown>
      let sec_bosque     = enc.sec_bosque     as Record<string, unknown>

      let finalStepCompleted = enc.step_completed
      if (enc.supabase_id) {
        const { data: remote } = await encTable()
          .select('sec_general, sec_vivienda, sec_familia, sec_economia, sec_cultivos, sec_ganaderia, sec_tecnologia, sec_bosque, step_completed')
          .eq('id', enc.supabase_id)
          .single()
        if (remote) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const r = remote as any
          sec_general    = mergeJsonb(r.sec_general    ?? {}, sec_general)
          sec_vivienda   = mergeJsonb(r.sec_vivienda   ?? {}, sec_vivienda)
          sec_familia    = mergeJsonb(r.sec_familia    ?? {}, sec_familia)
          sec_economia   = mergeJsonb(r.sec_economia   ?? {}, sec_economia)
          sec_cultivos   = mergeCultivos(r.sec_cultivos ?? [], sec_cultivos)
          sec_ganaderia  = mergeJsonb(r.sec_ganaderia  ?? {}, sec_ganaderia)
          sec_tecnologia = mergeJsonb(r.sec_tecnologia ?? {}, sec_tecnologia)
          sec_bosque     = mergeJsonb(r.sec_bosque     ?? {}, sec_bosque)
          finalStepCompleted = Math.max(enc.step_completed, r.step_completed ?? 0)
          // Actualizar Dexie local
          await db.encuestas.update(enc.id!, {
            sec_general:    sec_general    as EncuestaPredialRecord['sec_general'],
            sec_vivienda:   sec_vivienda   as EncuestaPredialRecord['sec_vivienda'],
            sec_familia:    sec_familia    as EncuestaPredialRecord['sec_familia'],
            sec_economia:   sec_economia   as EncuestaPredialRecord['sec_economia'],
            sec_cultivos,
            sec_ganaderia:  sec_ganaderia  as EncuestaPredialRecord['sec_ganaderia'],
            sec_tecnologia: sec_tecnologia as EncuestaPredialRecord['sec_tecnologia'],
            sec_bosque:     sec_bosque     as EncuestaPredialRecord['sec_bosque'],
            step_completed: finalStepCompleted,
          })
        }
      }

      // Obtener predio_id/expediente_id (core) si la encuesta tiene familia padre
      let predio_id: string | null = null
      let expediente_id: string | null = null
      if (enc.familia_local_id) {
        const fam = await db.familias.filter(f => f.local_id === enc.familia_local_id).first()
        predio_id     = fam?.predio_core_id ?? null
        expediente_id = fam?.expediente_id  ?? null
      }

      // Nota: nombre_propietario/municipio/vereda ya no son columnas de
      // siembra.familias (se leen por JOIN a core.aliados/core.predios).
      const payload = {
        local_id:           enc.local_id,
        sync_origin:        'pwa',
        fecha_encuesta:     enc.fecha_encuesta     || null,
        created_by:         enc.created_by         || null,
        step_completed:     finalStepCompleted,
        predio_id,
        expediente_id,
        sec_general,
        sec_vivienda,
        sec_familia,
        sec_economia,
        sec_cultivos,
        sec_ganaderia,
        sec_tecnologia,
        sec_bosque,
        updated_at:         new Date().toISOString(),
      }

      // Si fue importado → actualizar el registro remoto por ID (no crear duplicado).
      // Si es nuevo → insertar vía upsert por local_id.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { local_id: _lid, ...updatePayload } = payload
      const { data, error } = enc.supabase_id
        ? await encTable().update(updatePayload).eq('id', enc.supabase_id).select('id').single()
        : await encTable().upsert(payload, { onConflict: 'local_id' }).select('id').single()

      if (error) {
        const supMsg = [error.message, error.details, error.hint, error.code]
          .filter(Boolean).join(' | ')
        throw new Error(supMsg || JSON.stringify(error))
      }

      await db.encuestas.update(enc.id!, {
        sync_status: 'synced',
        sync_error:  null,
        supabase_id: data?.id ?? null,
        updated_at:  new Date().toISOString(),
      })
      synced++
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' ? JSON.stringify(err) : String(err))
      console.error('[sync encuesta] error:', msg)
      await db.encuestas.update(enc.id!, { sync_status: 'error', sync_error: msg })
      errors++
    }
  }

  return { synced, errors }
}

// ─── Sincronizar predios unificados → evaluaciones_campo + familias ───────────
export async function syncPendingPredios(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) return { synced: 0, errors: 0 }

  const pending = await db.predios
    .where('sync_status').anyOf(['pending', 'error'])
    .toArray()

  let synced = 0, errors = 0

  for (const predio of pending) {
    try {
      // 1. Subir fotos pendientes de este predio
      const pendingPhotos = await db.photos
        .where('local_evaluacion_id').equals(predio.local_id)
        .filter(p => p.sync_status === 'pending')
        .toArray()

      const photoUrlMap: Record<string, string> = {}
      for (const photo of pendingPhotos) {
        const url = await uploadPhoto(photo, predio.local_id)
        if (url) {
          photoUrlMap[photo.field_key] = url
          await db.photos.update(photo.id!, { sync_status: 'synced', uploaded_url: url })
        }
      }

      // 2. Recopilar URLs ya subidas
      const allPhotos = await db.photos
        .where('local_evaluacion_id').equals(predio.local_id)
        .toArray()
      for (const p of allPhotos) {
        if (p.uploaded_url) photoUrlMap[p.field_key] = p.uploaded_url
      }

      // 3. Subir firmas
      const f = predio.sec_firmas ?? {}
      const firma_eval1_url = f.firma_evaluador1_dataurl ? await uploadSignature(f.firma_evaluador1_dataurl, predio.local_id, 'eval1') : null
      const firma_eval2_url = f.firma_evaluador2_dataurl ? await uploadSignature(f.firma_evaluador2_dataurl, predio.local_id, 'eval2') : null

      // 4. Sustituir IDs de fotos por URLs en las zonas
      const zonas_data = predio.zonas.map(zona => {
        const zn = zona.zona_numero
        const s  = { ...zona.suelo }     as Record<string, unknown>
        const l  = { ...zona.logistica } as Record<string, unknown>
        if (s['foto_textura_id'])   { s['foto_textura_url']   = photoUrlMap[`zona_${zn}_textura`]   ?? null; delete s['foto_textura_id']   }
        if (s['foto_drenaje_id'])   { s['foto_drenaje_url']   = photoUrlMap[`zona_${zn}_drenaje`]   ?? null; delete s['foto_drenaje_id']   }
        if (s['foto_pendiente_id']) { s['foto_pendiente_url'] = photoUrlMap[`zona_${zn}_pendiente`] ?? null; delete s['foto_pendiente_id'] }
        if (s['foto_erosion_id'])   { s['foto_erosion_url']   = photoUrlMap[`zona_${zn}_erosion`]   ?? null; delete s['foto_erosion_id']   }
        if (l['foto_via_id'])       { l['foto_via_url']       = photoUrlMap[`zona_${zn}_via`]       ?? null; delete l['foto_via_id']       }
        return { ...zona, suelo: s, logistica: l }
      })

      // 5. Upsert en evaluaciones_campo
      // Nota: nombre_predio ya no es columna propia de evaluaciones_campo
      // (se lee por JOIN a core.predios); queda dentro de seccion_1_data.
      const evalPayload = {
        local_id:       predio.local_id,
        fecha_visita:   predio.fecha || null,
        num_zonas_eval: predio.num_zonas,
        step_completed: predio.step_completed,
        created_by:     predio.created_by || null,
        seccion_1_data: {
          codigo_formato:       'AE-CAMPO-001',
          version:              '1.0',
          fecha_visita:         predio.fecha,
          evaluador_1:          predio.evaluador_1,
          evaluador_2:          predio.evaluador_2,
          municipio:            predio.municipio,
          vereda:               predio.vereda,
          nombre_predio:        predio.nombre_predio,
          propietario_tenedor:  predio.nombre_propietario,
          contacto_propietario: predio.contacto_propietario,
          codigo_predio:        predio.codigo_predio,
          num_zonas:            predio.num_zonas,
          senal_celular:        predio.senal_disponible,
          operador_celular:     predio.operador_celular,
          area_zonas_ha:        predio.area_zonas_ha ? parseFloat(predio.area_zonas_ha) : null,
          tiempo_desde_via:     predio.tiempo_desde_via,
        },
        seccion_2_data: predio.sec_cartografia,
        zonas_data,
        seccion_6_data: predio.sec_riesgos,
        firma_eval1_url,
        firma_eval2_url,
        firma_prop_url:  null,
        sync_origin:     'pwa',
        updated_at:      new Date().toISOString(),
      }

      const { data: evalData, error: evalError } = await predioTable()
        .upsert(evalPayload, { onConflict: 'local_id' })
        .select('id')
        .single()

      if (evalError) {
        const m = [evalError.message, evalError.details, evalError.hint, evalError.code].filter(Boolean).join(' | ')
        throw new Error('evaluaciones_campo: ' + (m || JSON.stringify(evalError)))
      }

      // 6. Upsert en siembra.familias
      // Nota: nombre_propietario/municipio/vereda ya no son columnas propias
      // (se leen por JOIN a core.aliados/core.predios); quedan dentro de sec_general.
      const encPayload = {
        local_id:           predio.local_id,
        sync_origin:        'pwa',
        fecha_encuesta:     predio.fecha              || null,
        created_by:         predio.created_by         || null,
        step_completed:     predio.step_completed,
        sec_general: {
          encuesta_no:             predio.encuesta_no,
          fecha_encuesta:          predio.fecha,
          encuestador:             predio.encuestador,
          tipo_encuestado:         predio.tipo_encuestado,
          nombre_propietario:      predio.nombre_propietario,
          contacto:                predio.contacto_propietario,
          nombre_finca:            predio.nombre_predio,
          departamento:            predio.departamento || 'Caquetá',
          municipio:               predio.municipio,
          vereda:                  predio.vereda,
          estrato_paisaje:         predio.estrato_paisaje,
          latitud:                 predio.latitud,
          longitud:                predio.longitud,
          altitud_msnm:            predio.altitud_msnm,
          anio_adquisicion:        predio.anio_adquisicion,
          distancia_cabecera_km:   predio.distancia_cabecera_km,
          tipo_via:                predio.tipo_via,
          tipo_acceso_predio:      predio.tipo_acceso_predio,
          servicios_domiciliarios: predio.servicios_domiciliarios,
          fuente_agua:             predio.fuente_agua,
          senal_telefonica:        predio.senal_disponible,
        },
        sec_vivienda:   predio.sec_vivienda,
        sec_familia:    predio.sec_familia,
        sec_economia:   predio.sec_economia,
        sec_cultivos:   predio.sec_cultivos,
        sec_ganaderia:  predio.sec_ganaderia,
        sec_tecnologia: predio.sec_tecnologia,
        sec_bosque:     predio.sec_bosque,
        updated_at:     new Date().toISOString(),
      }

      const { data: encData, error: encError } = await encTable()
        .upsert(encPayload, { onConflict: 'local_id' })
        .select('id')
        .single()

      if (encError) {
        const m = [encError.message, encError.details, encError.hint, encError.code].filter(Boolean).join(' | ')
        throw new Error('familias: ' + (m || JSON.stringify(encError)))
      }

      await db.predios.update(predio.id!, {
        sync_status:      'synced',
        sync_error:       null,
        supabase_eval_id: evalData?.id ?? null,
        supabase_enc_id:  encData?.id  ?? null,
        updated_at:       new Date().toISOString(),
      })
      synced++
    } catch (err: unknown) {
      const msg = err instanceof Error
        ? err.message
        : (typeof err === 'object' ? JSON.stringify(err) : String(err))
      console.error('[sync predio] error:', msg)
      await db.predios.update(predio.id!, { sync_status: 'error', sync_error: msg })
      errors++
    }
  }

  return { synced, errors }
}
