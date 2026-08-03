import type { ZonaSig } from './core'
import type { ZonaVigente } from '../lib/geo'

// ─── §1 Identificación ───────────────────────────────────────────────────────
// nombre_predio/municipio/vereda/propietario_tenedor/contacto_propietario ya
// están en FamiliaRecord (snapshot de core, solo lectura). num_zonas/
// area_zonas_ha ya no se teclean: salen de ZonaData[] (geo.zonas, ver abajo).
export interface SeccionIdentificacion {
  codigo_formato: string        // AE-CAMPO-001
  version: string                // 1.0
  fecha_visita: string           // ISO date
  evaluador_1: string
  evaluador_2: string
  codigo_predio: string
  senal_celular: boolean
  operador_celular: string
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
// La zona NO la crea el encuestador: la dibujó el SIG (geo.zonas). Campo la
// confirma/describe (SIG II) — zona_id es la identidad real; zona_numero solo
// ordena la vista ("Zona 1", "Zona 2"...).
export interface ZonaData {
  zona_id:      string | null   // FK → geo.zonas.id (null solo en registros legacy pre-rediseño, o zona 'nueva' aún sin sincronizar)
  zona_numero:  number
  area_ha_sig:  number | null   // de solo lectura, calculada por PostGIS en el SIG
  cobertura: Partial<SeccionCobertura>
  suelo: Partial<SeccionSuelo>
  logistica: Partial<SeccionLogistica>
  // Se descartó en el módulo SIG (SIG II) después de crear la evaluación, pero
  // ya tenía datos capturados — se conserva para no perder el trabajo de campo
  // (ver reconciliarZonas). No se le pide más datos, solo se marca.
  descartada?: boolean
  // Llave de reconciliación para zonas 'nueva' (dibujadas en campo) mientras
  // zona_id sigue null — es RevisionRecord.local_id, estable aunque no haya
  // sincronizado. No tiene otro uso (no es FK a nada en Supabase).
  revision_local_id?: string | null
}

/** Construye una zona de evaluación a partir de una zona real del SIG. */
export function zonaDesdeSig(z: ZonaSig, numero: number): ZonaData {
  return {
    zona_id:     z.zona_id,
    zona_numero: numero,
    area_ha_sig: z.area_ha,
    cobertura: {}, suelo: {}, logistica: {},
  }
}

/** ¿Esta zona ya tiene algo capturado en terreno? (para no perder datos al reconciliar) */
function tieneDatos(z: ZonaData | undefined): boolean {
  if (!z) return false
  return Object.keys(z.cobertura).length > 0
    || Object.keys(z.suelo).length > 0
    || Object.keys(z.logistica).length > 0
}

/**
 * Recalcula la lista de zonas de una evaluación a partir del estado VIGENTE
 * del SIG (zonasVigentes: SIG I + revisiones locales de SIG II), en vez de
 * dejarla fija en lo que había al crear la evaluación. El número de veces que
 * se repite la sección biofísica es, literalmente, el número de zonas
 * vigentes — no algo que se le pregunte al evaluador.
 *
 * Reglas:
 * - Zona vigente activa (no descartada): se mantiene/crea, con sus datos ya
 *   capturados si existían (match por zona_id, o por revision_local_id para
 *   zonas 'nueva' que aún no tienen zona_id real).
 * - Zona vigente descartada CON datos ya capturados: se conserva en la lista
 *   (decisión del usuario: no perder trabajo de campo), marcada `descartada`.
 * - Zona vigente descartada SIN datos: se omite — nunca se le pidió nada al
 *   evaluador, no hay nada que conservar.
 * - zona_numero se reasigna en orden secuencial (igual que zonasVigentes).
 */
export function reconciliarZonas(actuales: ZonaData[], vigentes: ZonaVigente[]): ZonaData[] {
  const porZonaId = new Map(actuales.filter(z => z.zona_id).map(z => [z.zona_id as string, z]))
  const porRevisionLocalId = new Map(
    actuales.filter(z => !z.zona_id && z.revision_local_id).map(z => [z.revision_local_id as string, z])
  )

  const resultado: ZonaData[] = []
  let numero = 1

  for (const v of vigentes) {
    const prev = v.zona_id
      ? porZonaId.get(v.zona_id)
      : (v.revision?.local_id ? porRevisionLocalId.get(v.revision.local_id) : undefined)

    if (v.descartada && !tieneDatos(prev)) continue

    resultado.push({
      zona_id:            v.zona_id,
      zona_numero:        numero++,
      area_ha_sig:        v.area_ha,
      cobertura:          prev?.cobertura ?? {},
      suelo:              prev?.suelo ?? {},
      logistica:          prev?.logistica ?? {},
      descartada:         v.descartada,
      revision_local_id:  v.zona_id ? undefined : (v.revision?.local_id ?? null),
    })
  }

  return resultado
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
