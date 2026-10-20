// ─── Zona real dibujada por el SIG (geo.zonas) ───────────────────────────────
// Las trae el RPC geo.zonas_de_predio con su geometría en GeoJSON — la app las
// pinta, geolocaliza al técnico respecto a ellas y las corrige (SIG II).
export interface ZonaSig {
  zona_id:      string
  nombre:       string | null
  tipo:         string   // 'restauracion' | 'finca' | 'conservacion'
  estado:       string   // 'potencial' | 'validada' | 'definitiva' | 'avalada' | 'descartada'
  area_ha:      number | null
  perimetro_m:  number | null
  geojson:      string   // geometría GeoJSON (MultiPolygon, EPSG:4326)
}

// ─── Polígono del predio (geo.zonas tipo='finca') ────────────────────────────
// El límite del predio. En el flujo de siempre es contexto del mapa; desde el
// flujo «campo primero» (2026-10-20) campo también lo dibuja o lo corrige, por
// revisiones de tipo 'finca' (RPC geo.revisar_zona_campo).
export interface ZonaFinca {
  zona_id: string
  area_ha: number | null
  geojson: string
}

// ─── En qué orden se trabaja el predio (core.expedientes.flujo_campo) ────────
// sig_primero: el SIG propone zonas y campo las verifica (el de siempre).
// campo_primero: no hay propuesta; campo delimita el predio y las zonas desde
// cero y el SIG confirma después desde la intranet.
export type FlujoCampo = 'sig_primero' | 'campo_primero'

// ─── Predio habilitado para Campo (core.v_predios_campo) ────────────────────
// Snapshot de solo lectura: Jurídica + SIG ya lo capturaron, Campo NO lo retecla.
export interface PredioHabilitado {
  predio_id:              string
  expediente_id:          string | null
  aliado_id:              string | null
  nombre_predio:          string
  departamento:           string
  municipio:              string
  vereda:                 string
  zona_ae:                string | null
  matricula_inmobiliaria: string | null
  codigo_catastral:       string | null
  nombre_propietario:     string
  tipo_documento:         string | null
  numero_documento:       string | null
  telefono:               string | null
  etapa:                  string
  /** Ausente si la BD todavía no tiene migration_campo_primero.sql: se trata como sig_primero. */
  flujo_campo?:           FlujoCampo
  cached_at:              string
  zonas:                  ZonaSig[]     // tipo='restauracion', sin descartadas
  zonas_finca:            ZonaFinca[]   // tipo='finca' (contexto del mapa)
}
