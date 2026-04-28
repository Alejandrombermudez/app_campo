import { db } from '../db/schema'
import { supabase, evalTable } from './supabase'
import type { PhotoRecord } from '../types/evaluacion'

function encTable()     { return supabase.schema('siembra').from('familias') }
function predioTable()  { return supabase.schema('siembra').from('evaluaciones_campo') }
function familiaTable() { return supabase.schema('siembra').from('predios') }

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

// ─── Sincronizar familias/predios padre → siembra.predios ────────────────────
export async function syncPendingFamilias(): Promise<{ synced: number; errors: number }> {
  if (!navigator.onLine) return { synced: 0, errors: 0 }

  const pending = await db.familias
    .where('sync_status').anyOf(['pending', 'error'])
    .toArray()

  let synced = 0, errors = 0

  for (const familia of pending) {
    try {
      const payload = {
        local_id:           familia.local_id,
        nombre_predio:      familia.nombre_predio      || null,
        nombre_propietario: familia.nombre_propietario || null,
        municipio:          familia.municipio          || null,
        vereda:             familia.vereda             || null,
        fecha:              familia.fecha              || null,
        contacto:           familia.contacto           || null,
        departamento:       familia.departamento       || 'Caquetá',
        num_zonas:          familia.num_zonas,
        created_by:         familia.created_by         || null,
        sync_origin:        'pwa',
        updated_at:         new Date().toISOString(),
      }

      const { data, error } = await familiaTable()
        .upsert(payload, { onConflict: 'local_id' })
        .select('id')
        .single()

      if (error) {
        const supMsg = [error.message, error.details, error.hint, error.code]
          .filter(Boolean).join(' | ')
        throw new Error(supMsg || JSON.stringify(error))
      }

      await db.familias.update(familia.id!, {
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
      console.error('[sync familia] error:', msg)
      await db.familias.update(familia.id!, { sync_status: 'error', sync_error: msg })
      errors++
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
      const zonas_data = ev.zonas.map(zona => {
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

      // 5. Upsert en Supabase
      // Nota: municipio y codigo_predio no son columnas raíz de evaluaciones_campo;
      // ya viajan dentro de seccion_1_data (JSONB).
      const payload = {
        local_id:       ev.local_id,
        nombre_predio:  ev.nombre_predio,
        fecha_visita:   ev.fecha_visita || null,
        num_zonas_eval: ev.num_zonas,
        step_completed: ev.step_completed,
        created_by:     ev.created_by || null,
        seccion_1_data: ev.seccion_1,
        seccion_2_data: ev.seccion_2,
        zonas_data,
        seccion_6_data: ev.seccion_6,
        firma_eval1_url,
        firma_eval2_url,
        firma_prop_url,
        sync_origin:    'pwa',
        updated_at:     new Date().toISOString(),
      }

      const { data, error } = await evalTable().upsert(payload, { onConflict: 'local_id' }).select('id').single()
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
      const payload = {
        local_id:           enc.local_id,
        sync_origin:        'pwa',
        nombre_propietario: enc.nombre_propietario || null,
        municipio:          enc.municipio          || null,
        vereda:             enc.vereda             || null,
        fecha_encuesta:     enc.fecha_encuesta     || null,
        created_by:         enc.created_by         || null,
        step_completed:     enc.step_completed,
        sec_general:        enc.sec_general,
        sec_vivienda:       enc.sec_vivienda,
        sec_familia:        enc.sec_familia,
        sec_economia:       enc.sec_economia,
        sec_cultivos:       enc.sec_cultivos,
        sec_ganaderia:      enc.sec_ganaderia,
        sec_tecnologia:     enc.sec_tecnologia,
        sec_bosque:         enc.sec_bosque,
        updated_at:         new Date().toISOString(),
      }

      const { data, error } = await encTable()
        .upsert(payload, { onConflict: 'local_id' })
        .select('id')
        .single()

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
      const evalPayload = {
        local_id:       predio.local_id,
        nombre_predio:  predio.nombre_predio,
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
      const encPayload = {
        local_id:           predio.local_id,
        sync_origin:        'pwa',
        nombre_propietario: predio.nombre_propietario || null,
        municipio:          predio.municipio          || null,
        vereda:             predio.vereda             || null,
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
