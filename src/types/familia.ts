// ─── Entidad padre: Familia / Predio ─────────────────────────────────────────
export interface FamiliaRecord {
  id?: number
  local_id: string
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  supabase_id: string | null
  created_at: string
  updated_at: string
  created_by: string

  // Datos básicos del predio
  nombre_predio:      string   // *
  nombre_propietario: string   // *
  municipio:          string   // *
  vereda:             string
  fecha:              string   // * ISO date
  contacto:           string
  departamento:       string   // Caquetá (fijo)
  num_zonas:          number   // select 1–20 (para formulario de campo)
}

export function newFamilia(): FamiliaRecord {
  return {
    local_id:           crypto.randomUUID(),
    sync_status:        'pending',
    sync_error:         null,
    supabase_id:        null,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
    created_by:         localStorage.getItem('ae_campo_user') ?? '',
    nombre_predio:      '',
    nombre_propietario: '',
    municipio:          '',
    vereda:             '',
    fecha:              new Date().toISOString().slice(0, 10),
    contacto:           '',
    departamento:       'Caquetá',
    num_zonas:          1,
  }
}
