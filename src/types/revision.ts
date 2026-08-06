// ─── Revisión de zona (SIG II) ────────────────────────────────────────────────
// Cada acción del técnico sobre una zona en el módulo SIG se guarda como una
// revisión local (offline, Dexie) y al sincronizar se aplica en el servidor
// vía RPC geo.revisar_zona (idempotente por local_id). El servidor conserva
// la geometría ORIGINAL en geo.zona_revision y aplica el cambio a geo.zonas.
export type RevisionAccion = 'confirmada' | 'modificada' | 'nueva' | 'descartada'

export interface RevisionRecord {
  id?: number
  local_id: string                     // UUID — llave de idempotencia del sync
  familia_local_id: string             // FK a FamiliaRecord.local_id
  predio_core_id: string               // core.predios.id
  zona_id: string | null               // geo.zonas.id (null en 'nueva' hasta sincronizar)
  accion: RevisionAccion
  metodo: 'vertices' | 'gps' | 'nueva' | null
  geojson: string | null               // geometría corregida/nueva (GeoJSON 4326)
  area_ha: number | null               // calculada con turf al guardar
  observaciones: string
  zona_numero: number                  // para mostrar "Zona N" en la UI
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  created_by: string
  fecha: string                        // ISO date de la visita
  created_at: string
  updated_at: string
}

/** Lo que cambia una acción del módulo SIG sobre una zona. */
export interface CambiosRevision {
  accion: RevisionAccion
  metodo: RevisionRecord['metodo']
  geojson: string | null
  area_ha: number | null
}

/**
 * Qué queda cuando se actúa sobre una zona que YA tiene una revisión local
 * pendiente. La última acción manda, pero una geometría corregida en terreno
 * NUNCA se pierde por una acción posterior que no traiga geometría propia.
 *
 * Caso que lo motivó (reportado desde campo el 2026-08-06): corregir el
 * límite, Guardar, y después pulsar "Confirmar" — que es lo natural, se lee
 * como "confirmo mi corrección". Eso sobrescribía la revisión con geojson
 * null y la zona volvía al polígono original del SIG; al sincronizar viajaba
 * 'confirmada', que en el servidor solo marca estado='validada' sin escribir
 * geometría, así que la corrección se perdía también en la nube.
 *
 * Confirmar una zona ya corregida NO la devuelve a la forma del SIG: la
 * revisión sigue siendo 'modificada'/'nueva', que es la única acción con la
 * que geo.revisar_zona escribe la geometría nueva en geo.zonas.
 */
export function fusionarRevision(
  previa: RevisionRecord,
  cambios: CambiosRevision,
): CambiosRevision {
  const traeGeometriaPropia =
    !!previa.geojson && (previa.accion === 'modificada' || previa.accion === 'nueva')

  if (cambios.accion === 'confirmada' && traeGeometriaPropia) {
    return {
      accion:  previa.accion,
      metodo:  previa.metodo,
      geojson: previa.geojson,
      area_ha: previa.area_ha,
    }
  }

  return {
    ...cambios,
    geojson: cambios.geojson ?? previa.geojson,
    area_ha: cambios.area_ha ?? previa.area_ha,
    metodo:  cambios.metodo  ?? previa.metodo,
  }
}

export function newRevision(base: {
  familia_local_id: string
  predio_core_id: string
  zona_id: string | null
  accion: RevisionAccion
  metodo: RevisionRecord['metodo']
  geojson: string | null
  area_ha: number | null
  zona_numero: number
  observaciones?: string
}): RevisionRecord {
  return {
    local_id:    crypto.randomUUID(),
    sync_status: 'pending',
    sync_error:  null,
    created_by:  localStorage.getItem('ae_campo_user') ?? '',
    fecha:       new Date().toISOString().slice(0, 10),
    created_at:  new Date().toISOString(),
    updated_at:  new Date().toISOString(),
    observaciones: base.observaciones ?? '',
    ...base,
  }
}
