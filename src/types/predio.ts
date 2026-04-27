import type {
  SeccionCartografia, ZonaData, SeccionRiesgos, SeccionFirmas,
} from './evaluacion'
import type {
  EncuestaVivienda, EncuestaFamilia, EncuestaEconomia,
  CultivoRow, EncuestaGanaderia, EncuestaTecnologia, EncuestaBosque,
} from './encuesta'

// Re-export para uso en Predio/index sin imports extra
export type { ZonaData }

// ─── Registro unificado en IndexedDB ─────────────────────────────────────────
export interface PredioRecord {
  id?: number
  local_id: string
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  supabase_eval_id: string | null   // id en evaluaciones_campo
  supabase_enc_id:  string | null   // id en siembra.familias
  created_at: string
  updated_at: string
  step_completed: number
  created_by: string

  // ── Resumen para listado ─────────────────────────────────────────────────
  nombre_predio:      string
  municipio:          string
  vereda:             string
  fecha:              string   // = fecha_visita y fecha_encuesta
  nombre_propietario: string

  // ── §1 Campos comunes ────────────────────────────────────────────────────
  contacto_propietario: string
  senal_disponible:     boolean | null

  // ── §1 Sección CAMPO ─────────────────────────────────────────────────────
  evaluador_1:      string
  evaluador_2:      string
  codigo_predio:    string
  num_zonas:        number        // dropdown 1-20
  area_zonas_ha:    string
  tiempo_desde_via: string
  operador_celular: string

  // ── §1 Sección PREDIAL ────────────────────────────────────────────────────
  encuesta_no:            string
  tipo_encuestado:        string  // Propietario/Arrendatario/Mayordomo/Trabajador
  encuestador:            string
  departamento:           string  // Caquetá (fijo)
  estrato_paisaje:        string
  latitud:                string
  longitud:               string
  altitud_msnm:           number | null
  anio_adquisicion:       number | null
  distancia_cabecera_km:  number | null
  tipo_via:               string[]
  tipo_acceso_predio:     string[]
  servicios_domiciliarios: string[]
  fuente_agua:            string[]

  // ── Secciones CAMPO ───────────────────────────────────────────────────────
  sec_cartografia: Partial<SeccionCartografia>
  zonas:           ZonaData[]
  sec_riesgos:     Partial<SeccionRiesgos>
  sec_firmas:      Partial<SeccionFirmas>

  // ── Secciones PREDIAL ─────────────────────────────────────────────────────
  sec_vivienda:    Partial<EncuestaVivienda>
  sec_familia:     Partial<EncuestaFamilia>
  sec_economia:    Partial<EncuestaEconomia>
  sec_cultivos:    CultivoRow[]
  sec_ganaderia:   Partial<EncuestaGanaderia>
  sec_tecnologia:  Partial<EncuestaTecnologia>
  sec_bosque:      Partial<EncuestaBosque>
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CULTIVOS_BASE = ['Café','Cacao','Caña de azúcar','Plátano','Yuca','Frutales','Madera']
const emptyCultivo = (nombre = ''): CultivoRow => ({
  cultivo: nombre, area_ha: '', anio_siembra: '', densidad: '', rendimiento: '', destino: '',
})

export function emptyZona(n: number): ZonaData {
  return { zona_numero: n, cobertura: {}, suelo: {}, logistica: {} }
}

export function newPredio(): PredioRecord {
  return {
    local_id:          crypto.randomUUID(),
    sync_status:       'pending',
    sync_error:        null,
    supabase_eval_id:  null,
    supabase_enc_id:   null,
    created_at:        new Date().toISOString(),
    updated_at:        new Date().toISOString(),
    step_completed:    0,
    created_by:        localStorage.getItem('ae_campo_user') ?? '',

    nombre_predio:       '',
    municipio:           '',
    vereda:              '',
    fecha:               '',
    nombre_propietario:  '',
    contacto_propietario: '',
    senal_disponible:    null,

    evaluador_1:       '',
    evaluador_2:       '',
    codigo_predio:     '',
    num_zonas:         1,
    area_zonas_ha:     '',
    tiempo_desde_via:  '',
    operador_celular:  '',

    encuesta_no:            '',
    tipo_encuestado:        '',
    encuestador:            '',
    departamento:           'Caquetá',
    estrato_paisaje:        '',
    latitud:                '',
    longitud:               '',
    altitud_msnm:           null,
    anio_adquisicion:       null,
    distancia_cabecera_km:  null,
    tipo_via:               [],
    tipo_acceso_predio:     [],
    servicios_domiciliarios: [],
    fuente_agua:            [],

    sec_cartografia: {},
    zonas:           [emptyZona(1)],
    sec_riesgos:     {},
    sec_firmas:      {},

    sec_vivienda:    {},
    sec_familia:     {},
    sec_economia:    {},
    sec_cultivos:    CULTIVOS_BASE.map(emptyCultivo),
    sec_ganaderia:   {},
    sec_tecnologia:  {},
    sec_bosque:      {},
  }
}
