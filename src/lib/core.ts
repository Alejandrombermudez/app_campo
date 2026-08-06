import { supabase } from './supabase'
import { db } from '../db/schema'
import type { PredioHabilitado, ZonaSig, ZonaFinca } from '../types/core'

/** Vista core.v_predios_campo: predios que Jurídica+SIG ya habilitaron. */
function prediosCampoTable() {
  return supabase.schema('core').from('v_predios_campo')
}

const COLUMNAS_PREDIO = `
  predio_id, expediente_id, aliado_id, nombre_predio, departamento,
  municipio, vereda, zona_ae, matricula_inmobiliaria, codigo_catastral,
  nombre_propietario, tipo_documento, numero_documento, telefono, etapa
`

/** Fila de identidad de core.v_predios_campo (sin zonas ni marca de caché). */
export type PredioCampoRow = Omit<PredioHabilitado, 'cached_at' | 'zonas' | 'zonas_finca'>

interface ZonaRpcRow {
  id: string
  nombre: string | null
  tipo: string
  estado: string
  area_ha: number | null
  perimetro_m: number | null
  propiedades: Record<string, unknown> | null
  geojson: string
}

/**
 * Zonas del predio con geometría GeoJSON (RPC geo.zonas_de_predio).
 *
 * LANZA si la consulta falla — nunca devuelve listas vacías por un fallo de
 * red. La diferencia es crítica: una lista vacía significa literalmente "el
 * SIG no tiene zonas para este predio", y quien sobrescriba el snapshot local
 * con eso borra el trabajo de campo. Un error de red debe abortar, no vaciar.
 */
export async function fetchZonasPredio(predioId: string): Promise<{ siembra: ZonaSig[]; finca: ZonaFinca[] }> {
  const { data, error } = await supabase
    .schema('geo').rpc('zonas_de_predio', { p_predio_id: predioId })

  if (error) {
    console.error('[core] fetchZonasPredio error:', error.message)
    throw new Error(`No se pudieron consultar las zonas del SIG: ${error.message}`)
  }

  const rows = (data ?? []) as ZonaRpcRow[]
  return {
    siembra: rows
      .filter(z => z.tipo === 'restauracion' && z.estado !== 'descartada')
      .map(z => ({
        zona_id:     z.id,
        nombre:      z.nombre,
        tipo:        z.tipo,
        estado:      z.estado,
        area_ha:     z.area_ha,
        perimetro_m: z.perimetro_m,
        geojson:     z.geojson,
      })),
    finca: rows
      .filter(z => z.tipo === 'finca')
      .map(z => ({ zona_id: z.id, area_ha: z.area_ha, geojson: z.geojson })),
  }
}

/** Descarga los predios habilitados + sus zonas SIG (con geometría) y los deja en caché (Dexie) para uso offline. */
export async function refreshPrediosHabilitados(): Promise<PredioHabilitado[]> {
  if (!navigator.onLine) return getPrediosHabilitadosCache()

  const { data, error } = await prediosCampoTable()
    .select(COLUMNAS_PREDIO)
    .order('nombre_predio', { ascending: true })

  if (error || !data) {
    console.error('[core] refreshPrediosHabilitados error:', error?.message)
    return getPrediosHabilitadosCache()
  }

  const cachedAt = new Date().toISOString()
  const withZonas: PredioHabilitado[] = []
  try {
    for (const p of data) {
      const { siembra, finca } = await fetchZonasPredio(p.predio_id)
      // SIG I es obligatorio: la vista ya lo exige (EXISTS geo.zonas), pero se
      // repite aquí como cinturón de seguridad — nunca ofrecer un predio sin
      // zonas reales, aunque la vista quede desactualizada o falle el filtro.
      if (siembra.length === 0) continue
      withZonas.push({ ...p, cached_at: cachedAt, zonas: siembra, zonas_finca: finca })
    }
  } catch (err) {
    // Si la señal se cae a mitad de la descarga, la lista quedaría incompleta.
    // Vale más conservar la caché anterior intacta que borrar predios que sí
    // existen (el clear() de abajo es destructivo).
    console.error('[core] refreshPrediosHabilitados zonas error:', err)
    return getPrediosHabilitadosCache()
  }

  await db.prediosHabilitados.clear()
  if (withZonas.length) await db.prediosHabilitados.bulkAdd(withZonas)
  return withZonas
}

/**
 * Fila viva de un predio en core.v_predios_campo (identidad actual, sin zonas).
 * Devuelve null si el predio ya no está habilitado para Campo (p. ej. el
 * expediente avanzó de etapa) — eso NO es un error: las zonas se siguen
 * pudiendo consultar. Lanza solo si la consulta misma falla.
 */
export async function fetchPredioCampo(predioId: string): Promise<PredioCampoRow | null> {
  const { data, error } = await prediosCampoTable()
    .select(COLUMNAS_PREDIO)
    .eq('predio_id', predioId)
    .maybeSingle()

  if (error) {
    console.error('[core] fetchPredioCampo error:', error.message)
    throw new Error(`No se pudo consultar el predio en el núcleo: ${error.message}`)
  }
  return (data as PredioCampoRow | null) ?? null
}

/** Lista de predios habilitados desde la caché local (funciona sin internet). */
export function getPrediosHabilitadosCache(): Promise<PredioHabilitado[]> {
  return db.prediosHabilitados.orderBy('nombre_predio').toArray()
}

/** Un predio habilitado puntual desde la caché local, por id. */
export function getPredioHabilitadoCache(predioId: string): Promise<PredioHabilitado | undefined> {
  return db.prediosHabilitados.get(predioId)
}

/** Identidad de un predio (nombre/municipio/propietario) para mostrar en los visualizadores de solo lectura. */
export interface PredioIdentidad {
  nombre_predio: string
  municipio: string
  vereda: string
  nombre_propietario: string
}

export async function getPredioIdentidad(predioId: string): Promise<PredioIdentidad | undefined> {
  const cached = await getPredioHabilitadoCache(predioId)
  if (cached) return cached

  if (!navigator.onLine) return undefined
  const { data, error } = await prediosCampoTable()
    .select('nombre_predio, municipio, vereda, nombre_propietario')
    .eq('predio_id', predioId)
    .maybeSingle()
  if (error || !data) return undefined
  return data
}

/**
 * ¿Esta persona (created_by, tal cual quedó guardado en localStorage) ya tiene
 * un formulario sincronizado de este tipo para este predio? Evita que la misma
 * persona diligencie dos veces el mismo predio (p.ej. tras reinstalar la app o
 * abrirla en otro dispositivo, donde no queda registro local del envío previo).
 * Solo se puede verificar con internet — sin conexión no bloquea la creación.
 */
export async function buscarDiligenciamientoPropio(
  tabla: 'evaluaciones_campo' | 'familias',
  predioId: string,
  createdBy: string,
): Promise<{ id: string; created_at: string } | undefined> {
  if (!navigator.onLine || !createdBy.trim()) return undefined
  let query = supabase.schema('siembra').from(tabla)
    .select('id, created_at')
    .eq('predio_id', predioId)
    .eq('created_by', createdBy.trim())
  if (tabla === 'familias') query = query.is('deleted_at', null)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(1)
  if (error || !data || data.length === 0) return undefined
  return data[0]
}
