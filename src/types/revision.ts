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
