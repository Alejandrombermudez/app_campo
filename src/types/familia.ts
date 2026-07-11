import type { PredioHabilitado, ZonaSig, ZonaFinca } from './core'

// ─── Entidad padre: Familia / Predio ─────────────────────────────────────────
// Ya NO se crea en blanco: nace de un PredioHabilitado (core.v_predios_campo),
// que ya pasó por Jurídica + SIG. Identidad/ubicación/propietario/zonas son un
// SNAPSHOT de solo lectura tomado de ahí — el encuestador no los teclea.
export interface FamiliaRecord {
  id?: number
  local_id: string
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  supabase_id: string | null
  created_at: string
  updated_at: string
  created_by: string

  // Enlace real hacia core (Jurídica). Null solo en registros creados antes
  // de este rediseño (2026-07-07) — ver ARQUITECTURA_DATOS.md §3.3.
  predio_core_id: string | null   // core.predios.id
  expediente_id:  string | null   // core.expedientes.id

  // Snapshot de solo lectura desde core.v_predios_campo (NO editable en la app)
  nombre_predio:      string
  nombre_propietario: string
  municipio:          string
  vereda:             string
  departamento:       string
  contacto:           string

  // Zonas reales que dibujó el SIG para este predio (geo.zonas) — Campo las
  // verifica en terreno y las corrige en el módulo SIG (revisiones locales).
  // num_zonas queda como resumen derivado.
  zonas_sig:   ZonaSig[]
  zonas_finca: ZonaFinca[]   // límite de la finca, solo contexto del mapa
  num_zonas:   number

  fecha: string   // fecha de la visita/encuesta — esto sí lo define el encuestador

  // Predio de práctica para capacitación (ver lib/practica.ts): no representa
  // un predio real, nunca se sincroniza a Supabase (ver guards en lib/sync.ts).
  es_practica?:       boolean
  practica_anclada?:  boolean   // true una vez que las zonas ya se generaron alrededor del GPS real
}

/** Crea la familia de trabajo local a partir de un predio ya habilitado (Jurídica+SIG). */
export function newFamiliaDesdeHabilitado(p: PredioHabilitado): FamiliaRecord {
  // SIG I es obligatorio: un predio sin zonas reales no debería llegar aquí
  // (el picker y la vista core.v_predios_campo ya lo filtran). Se deja el
  // chequeo explícito en vez de fabricar una zona falsa si algo se rompe.
  if (p.zonas.length === 0) {
    throw new Error(`El predio "${p.nombre_predio}" no tiene zonas de SIG (geo.zonas) — no se puede abrir en Campo todavía.`)
  }
  return {
    local_id:           crypto.randomUUID(),
    // Sin remoto propio: la familia es solo un puntero local a un predio de
    // core (ya sincronizado por Jurídica/SIG), no hay nada que subir.
    sync_status:        'synced',
    sync_error:         null,
    supabase_id:        null,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
    created_by:         localStorage.getItem('ae_campo_user') ?? '',

    predio_core_id:     p.predio_id,
    expediente_id:      p.expediente_id,

    nombre_predio:      p.nombre_predio,
    nombre_propietario: p.nombre_propietario,
    municipio:          p.municipio,
    vereda:             p.vereda,
    departamento:       p.departamento,
    contacto:           p.telefono ?? '',

    zonas_sig:          p.zonas,
    zonas_finca:        p.zonas_finca ?? [],
    num_zonas:          p.zonas.length,

    fecha:              new Date().toISOString().slice(0, 10),
  }
}
