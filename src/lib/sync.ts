import { db } from '../db/schema'
import { supabase, evalTable } from './supabase'
import type { PhotoRecord } from '../types/evaluacion'

function encTable() {
  return supabase.schema('siembra').from('familias')
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
