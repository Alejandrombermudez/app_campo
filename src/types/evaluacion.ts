// ─── §1 Identificación ───────────────────────────────────────────────────────
export interface SeccionIdentificacion {
  codigo_formato: string        // AE-CAMPO-001
  version: string               // 1.0
  fecha_visita: string          // ISO date
  evaluador_1: string
  evaluador_2: string
  codigo_predio: string
  nombre_predio: string
  municipio: string
  vereda: string                // Vereda del predio
  propietario_tenedor: string   // Propietario o tenedor del predio
  contacto_propietario: string  // Teléfono / contacto
  num_zonas: number             // CLAVE: controla repetición §3 §4 §5
  senal_celular: boolean
  operador_celular: string
  area_zonas_ha: number | null
  tiempo_desde_via: string
}

// ─── §2 Cartografía Social ────────────────────────────────────────────────────
export interface SeccionCartografia {
  disposicion_propietario: string   // Muy favorable/Favorable/Neutro/Escéptico/No acepta
  ajustes_poligono: string
  observaciones_sociales: string
  mano_obra_disponible: boolean
  experiencia_restauracion: boolean
}

// ─── §3 Cobertura Vegetal (por zona) ─────────────────────────────────────────
export interface SeccionCobertura {
  cobertura_dominante: string
  pct_cobertura_boscosa: string     // 0-25% / 25-50% / 50-75% / 75-100%
  densidad_rastrojo: string         // Ralo / Denso / Muy denso
  especies_arboreas_alturas: string
  regeneracion_natural: string      // Escasa / Moderada / Abundante
  defaunacion: string               // Leve / Moderada / Severa
  presion_fauna_ganado: string
  requiere_proteccion: string       // Sí / No / Parcial
}

// ─── §4 Suelo y Topografía (por zona) ────────────────────────────────────────
export interface SeccionSuelo {
  textura_suelo: string             // Arcilloso / Arenoso / Franco
  drenaje_superficial: string       // Bien drenado / Moderado / Mal drenado
  pendiente: string                 // Plano / Lomerío / Montaña
  presencia_roca: string            // Ausente / Leve / Moderada / Severa
  erosion: string                   // Sin erosión / Leve / Moderada / Severa
  fuente_agua: string
  distancia_agua_m: number | null
  observaciones_suelo: string
  // IDs de fotos en Dexie
  foto_textura_id: number | null
  foto_drenaje_id: number | null
  foto_pendiente_id: number | null
  foto_erosion_id: number | null
}

// ─── §5 Logística y Acceso (por zona) ────────────────────────────────────────
export interface SeccionLogistica {
  tipo_via: string
  medio_acceso_zonas: string[]      // Carro / Moto / Caballo / Pie / Canoa
  tiempo_predio_zona: string
  condicion_camino: string          // Buena / Regular / Difícil / Muy difícil
  lugar_deposito_material: string
  complejidad_acceso: string        // Baja / Media / Alta / Muy alta
  descripcion_ruta: string
  foto_via_id: number | null
}

// ─── §6 Riesgos y Restricciones ──────────────────────────────────────────────
export interface SeccionRiesgos {
  quemas_recientes: boolean
  anio_quema: string
  ganado_activo_poligono: boolean
  cabezas_poligono: number | null
  conflictos_tenencia: boolean
  descripcion_conflictos: string
  restricciones_uso: boolean
  cuales_restricciones: string
  otros_riesgos: string
  observaciones_riesgos: string
}

// ─── §7 Firmas ───────────────────────────────────────────────────────────────
export interface SeccionFirmas {
  firma_evaluador1_dataurl: string | null
  firma_evaluador2_dataurl: string | null
  firma_propietario_dataurl: string | null
}

// ─── Zona completa ────────────────────────────────────────────────────────────
export interface ZonaData {
  zona_numero: number
  cobertura: Partial<SeccionCobertura>
  suelo: Partial<SeccionSuelo>
  logistica: Partial<SeccionLogistica>
}

// ─── Registro principal en IndexedDB ─────────────────────────────────────────
export interface EvaluacionRecord {
  id?: number                         // auto-increment Dexie
  local_id: string                    // UUID cliente
  familia_local_id?: string           // FK a FamiliaRecord.local_id
  supabase_id: string | null
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  created_at: string
  updated_at: string
  step_completed: number
  created_by: string                  // nombre del evaluador (localStorage)

  // Resumen para listado Home
  nombre_predio: string
  codigo_predio: string
  municipio: string
  fecha_visita: string
  num_zonas: number

  // Datos de cada sección
  seccion_1: Partial<SeccionIdentificacion>
  seccion_2: Partial<SeccionCartografia>
  zonas: ZonaData[]
  seccion_6: Partial<SeccionRiesgos>
  seccion_7: Partial<SeccionFirmas>
}

// ─── Foto en IndexedDB ────────────────────────────────────────────────────────
export interface PhotoRecord {
  id?: number
  local_evaluacion_id: string
  field_key: string               // "zona_1_textura" | "zona_2_drenaje" | etc.
  blob: Blob
  mime_type: string
  filename: string
  uploaded_url: string | null
  sync_status: 'pending' | 'synced'
}
