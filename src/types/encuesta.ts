// ─── §1 Datos Generales + §2 Datos del Predio ────────────────────────────────
export interface EncuestaGeneral {
  encuesta_no: string
  fecha_encuesta: string
  encuestador: string
  tipo_encuestado: string          // Propietario/Arrendatario/Mayordomo/Trabajador
  nombre_propietario: string
  contacto: string
  nombre_finca: string
  departamento: string             // Caquetá (fijo)
  municipio: string
  vereda: string
  estrato_paisaje: string          // Sabana/Vega/Tierra firme alta/media/baja
  latitud: string
  longitud: string
  altitud_msnm: number | null
  anio_adquisicion: number | null
  distancia_cabecera_km: number | null
  tipo_via: string[]               // multi
  tipo_acceso_predio: string[]     // multi
  servicios_domiciliarios: string[]// multi
  fuente_agua: string[]            // multi
  senal_telefonica: boolean | null
}

// ─── §3 Vivienda ──────────────────────────────────────────────────────────────
export interface EncuestaVivienda {
  material_techo: string
  material_paredes: string
  material_piso: string
  num_habitaciones: number | null
  personas_vivienda: number | null
  tipo_cocina: string[]
  tipo_bano: string[]
  disposicion_excretas: string
  disposicion_aguas_servidas: string
  manejo_basuras: string[]
}

// ─── §4 Núcleo Familiar ───────────────────────────────────────────────────────
export interface MiembroFamilia {
  parentesco: string
  edad: string
  sexo: string
  depto_procedencia: string
  depto_residencia: string
  nivel_estudio: string
  dias_finca: string
  dias_fuera: string
}

export interface EncuestaFamilia {
  poblacion_tendencia: string      // incrementado/disminuido
  acceso_salud: boolean | null
  regimen_salud: string            // Contributivo/Subsidiado
  puesto_salud: string
  acceso_educacion: boolean | null
  distancia_educacion_km: number | null
  tiempo_llegada_region: string
  razon_llegada: string
  miembros: MiembroFamilia[]
}

// ─── §5 Valorización ──────────────────────────────────────────────────────────
export interface EncuestaEconomia {
  ha_total: number | null
  valor_comercial_ha: number | null
  tendencia_area: string           // incrementado/disminuido
  cambio_area_ha: number | null
  intencion_vender: boolean | null
  causas_venta: string[]
  medio_transporte_produccion: string
  transporte_propio: string        // Propio/Rentado
  valor_transporte: number | null
  problemas_mercado: string
  nivel_ingresos: string           // <1SMLV / >1SMLV / <5SMLV / >5SMLV
}

// ─── §6A Cultivos ─────────────────────────────────────────────────────────────
export interface CultivoRow {
  cultivo: string
  area_ha: string
  anio_siembra: string
  densidad: string
  rendimiento: string
  destino: string
}

// ─── §6B Ganadería ───────────────────────────────────────────────────────────
export interface OtraEspecie {
  cantidad: string
  uso_propio: boolean
  comercializacion: boolean
}

export interface EncuestaGanaderia {
  tiene_ganaderia: boolean | null
  tipo_tenencia_ganado: string
  orientacion_ganaderia: string[]
  num_cabezas_ganado: number | null
  ha_ganaderia: number | null
  tipos_pasto: string[]
  litros_leche_dia: number | null
  tanque_enfriamiento: string      // Propio/Comunitario/Arrendado/No
  destino_leche: string[]
  precio_leche_litro: number | null
  sistema_alimentacion_ganado: string[]
  especies_forrajeras: string
  uso_fertilizacion_ganado: string[]
  manejo_praderas: string[]
  infraestructura_ganadera: string[]
  material_postes: string[]
  ha_pasto_ultimo_anio: number | null
  origen_nuevos_pastos: string[]
  // Regenerativa
  pastoreo_rotacional: boolean
  diversificacion_forrajera: boolean
  cercas_vivas: boolean
  sistemas_silvopastoriles: boolean
  captacion_agua_lluvia: boolean
  manejo_residuos_organicos: boolean
  reduccion_antibioticos: boolean
  espacios_sombra_agua: boolean
  reduccion_estres: boolean
  interes_ganaderia_regenerativa: boolean
  // Otras especies
  equinos: Partial<OtraEspecie>
  porcinos: Partial<OtraEspecie>
  aves: Partial<OtraEspecie>
  peces: Partial<OtraEspecie>
}

// ─── §7 Nivel Tecnológico ─────────────────────────────────────────────────────
export interface EncuestaTecnologia {
  instalaciones_maquinaria: string
  tiene_tractor: boolean | null
  tiene_camion: boolean | null
  manejo_suelo_fertilizacion: string   // Orgánico/Convencional/Mixto
  tipo_fertilizacion: string[]
  cobertura_arborea: boolean | null
  practica_podas: boolean | null
  practica_raleo: boolean | null
  control_malezas: string[]
  manejo_agua_cultivo: string
  problemas_manejo: string[]
  especies_variedades: string
  lleva_registros_productividad: boolean | null
  interes_capacitacion: boolean | null
  temas_capacitacion: string
}

// ─── §8 Bosque & Clima + §9 Relaciones ───────────────────────────────────────
export interface EncuestaBosque {
  // §8
  aprovecha_bosque: boolean | null
  productos_forestales: string
  capacitacion_ambiente: boolean | null
  entidad_capacitacion: string
  especies_bosque_predio: string
  especies_fauna_predio: string
  estudio_academico: boolean | null
  disminucion_especies: boolean | null
  especies_afectadas: string
  cambios_caudal: boolean | null
  cambio_cobertura_ha: number | null
  causa_cambio_cobertura: string[]
  problemas_agropecuarios: string[]
  // §9
  programas_gubernamentales: string
  beneficios_programas: string
  impacto_programa: string          // Positivo/Negativo/Sin cambio
  opinion_productores: boolean | null
  aliado_cooperativa: boolean | null
  nombre_cooperativa: string
  beneficio_cooperativa: string
  calificacion_gremios: string      // Suficiente/Insuficiente/No existe
  observaciones_generales: string
}

// ─── Registro principal en IndexedDB ─────────────────────────────────────────
export interface EncuestaPredialRecord {
  id?: number
  local_id: string
  familia_local_id?: string           // FK a FamiliaRecord.local_id
  supabase_id: string | null
  sync_status: 'pending' | 'synced' | 'error'
  sync_error: string | null
  created_at: string
  updated_at: string
  step_completed: number           // 0-7
  created_by: string

  // Resumen para listado
  nombre_propietario: string
  municipio: string
  vereda: string
  fecha_encuesta: string

  // Secciones
  sec_general: Partial<EncuestaGeneral>
  sec_vivienda: Partial<EncuestaVivienda>
  sec_familia: Partial<EncuestaFamilia>
  sec_economia: Partial<EncuestaEconomia>
  sec_cultivos: CultivoRow[]
  sec_ganaderia: Partial<EncuestaGanaderia>
  sec_tecnologia: Partial<EncuestaTecnologia>
  sec_bosque: Partial<EncuestaBosque>
}
