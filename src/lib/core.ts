import { supabase } from './supabase'
import { db } from '../db/schema'
import type { PredioHabilitado, ZonaSig, ZonaFinca, CapaApoyo } from '../types/core'

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

interface CapaRpcRow {
  id: string
  predio_id: string
  capa: string
  clase: string | null
  nombre: string | null
  area_ha: number | string | null
  geojson: string
}

/**
 * Capas de apoyo de todos los predios que ve la app (RPC geo.capas_apoyo_campo),
 * agrupadas por predio. Si la BD todavía no tiene migration_campo_primero.sql la
 * función no existe: eso no es un error, simplemente no hay capas. Cualquier otro
 * fallo LANZA, como fetchZonasPredio.
 */
export async function fetchCapasApoyo(): Promise<Map<string, CapaApoyo[]>> {
  const { data, error } = await supabase.schema('geo').rpc('capas_apoyo_campo')
  const porPredio = new Map<string, CapaApoyo[]>()
  if (error) {
    if (error.code === 'PGRST202' || /capas_apoyo_campo/.test(error.message ?? '')) return porPredio
    console.error('[core] fetchCapasApoyo error:', error.message)
    throw new Error(`No se pudieron consultar las capas de apoyo: ${error.message}`)
  }
  const decisiones = await fetchDecisionesApoyo()
  for (const c of (data ?? []) as CapaRpcRow[]) {
    const lista = porPredio.get(c.predio_id) ?? []
    const d = decisiones.get(c.id)
    lista.push({
      id: c.id, capa: c.capa, clase: c.clase, nombre: c.nombre,
      area_ha: c.area_ha == null ? null : Number(c.area_ha), geojson: c.geojson,
      estado_campo: d?.estado ?? null, observacion_campo: d?.observaciones ?? null,
    })
    porPredio.set(c.predio_id, lista)
  }
  return porPredio
}

/**
 * Qué áreas de apoyo ya usó o rechazó campo, en cualquier celular (RPC
 * geo.decisiones_capa_apoyo_campo, migration_sitios_proyecto.sql). Es un dato
 * de ayuda: si falla o la función no existe, se sigue sin él.
 */
async function fetchDecisionesApoyo(): Promise<Map<string, { estado: 'usada' | 'descartada'; observaciones: string | null }>> {
  const m = new Map<string, { estado: 'usada' | 'descartada'; observaciones: string | null }>()
  try {
    const { data, error } = await supabase.schema('geo').rpc('decisiones_capa_apoyo_campo')
    if (error) return m
    for (const d of (data ?? []) as { capa_apoyo_id: string; estado: 'usada' | 'descartada'; observaciones: string | null }[]) {
      m.set(d.capa_apoyo_id, { estado: d.estado, observaciones: d.observaciones })
    }
  } catch { /* sin señal: sin el dato */ }
  return m
}

/**
 * Lee la vista con `flujo_campo`. Si la BD todavía no tiene
 * migration_campo_primero.sql, la columna no existe (42703): se repite sin
 * ella y todo se trata como «SIG primero», que es lo que había. Así esta
 * versión de la app puede salir antes que la migración sin dejar a nadie sin
 * predios.
 */
async function leerPrediosCampo(predioId?: string) {
  const consulta = (cols: string) => {
    const q = prediosCampoTable().select(cols)
    return predioId ? q.eq('predio_id', predioId) : q.order('nombre_predio', { ascending: true })
  }
  const r = await consulta(`${COLUMNAS_PREDIO}, flujo_campo`)
  if (r.error && (r.error.code === '42703' || /flujo_campo/.test(r.error.message ?? ''))) {
    return consulta(COLUMNAS_PREDIO)
  }
  return r
}

// Con decenas de predios (Elegibilidad LDH, 2026-10-20) bajar las zonas de uno
// en uno tardaba y se repetía en cada cambio de pestaña de Home. Ahora: varias
// a la vez, una sola descarga en curso compartida por quien la pida, y una
// descarga reciente se reutiliza en vez de repetirse.
const ZONAS_EN_PARALELO = 6
const REUTILIZAR_MS = 60_000
let descargaEnCurso: Promise<PredioHabilitado[]> | null = null
let ultimaDescargaOk = 0

/** Descarga los predios habilitados + sus zonas SIG (con geometría) y los deja en caché (Dexie) para uso offline. */
export function refreshPrediosHabilitados(): Promise<PredioHabilitado[]> {
  if (!navigator.onLine) return getPrediosHabilitadosCache()
  if (descargaEnCurso) return descargaEnCurso
  if (Date.now() - ultimaDescargaOk < REUTILIZAR_MS) return getPrediosHabilitadosCache()
  descargaEnCurso = descargarPrediosHabilitados().finally(() => { descargaEnCurso = null })
  return descargaEnCurso
}

async function descargarPrediosHabilitados(): Promise<PredioHabilitado[]> {
  const { data, error } = await leerPrediosCampo()

  if (error || !data) {
    console.error('[core] refreshPrediosHabilitados error:', error?.message)
    return getPrediosHabilitadosCache()
  }

  const cachedAt = new Date().toISOString()
  const filas = data as unknown as PredioCampoRow[]
  const resultado: (PredioHabilitado | null)[] = new Array(filas.length).fill(null)
  try {
    // Las capas de apoyo llegan todas en una sola llamada (son referencia, no
    // sitios). Si la descarga falla, se aborta igual que con las zonas: la
    // copia anterior queda intacta en vez de quedarse sin la guía.
    const capas = await fetchCapasApoyo()
    // Un error en cualquier predio rechaza todo (Promise.all): mismo efecto que
    // antes con el bucle, la caché anterior queda intacta.
    let siguiente = 0
    const trabajador = async () => {
      while (siguiente < filas.length) {
        const i = siguiente++
        const p = filas[i]
        const { siembra, finca } = await fetchZonasPredio(p.predio_id)
        // SIG I es obligatorio en el flujo de siempre: la vista ya lo exige
        // (EXISTS geo.zonas), pero se repite aquí como cinturón de seguridad —
        // nunca ofrecer un predio sin zonas reales, aunque la vista quede
        // desactualizada o falle el filtro. La única excepción es un predio
        // enviado como «campo primero»: ahí las zonas las dibuja el terreno.
        if (siembra.length === 0 && p.flujo_campo !== 'campo_primero') continue
        resultado[i] = { ...p, cached_at: cachedAt, zonas: siembra, zonas_finca: finca, capas_apoyo: capas.get(p.predio_id) ?? [] }
      }
    }
    await Promise.all(Array.from({ length: Math.min(ZONAS_EN_PARALELO, filas.length) }, trabajador))
  } catch (err) {
    // Si la señal se cae a mitad de la descarga, la lista quedaría incompleta.
    // Vale más conservar la caché anterior intacta que borrar predios que sí
    // existen (el clear() de abajo es destructivo).
    console.error('[core] refreshPrediosHabilitados zonas error:', err)
    return getPrediosHabilitadosCache()
  }

  // El orden de la vista (por nombre) se conserva aunque las zonas lleguen en desorden.
  const withZonas = resultado.filter((p): p is PredioHabilitado => p !== null)
  await db.prediosHabilitados.clear()
  if (withZonas.length) await db.prediosHabilitados.bulkAdd(withZonas)
  ultimaDescargaOk = Date.now()
  return withZonas
}

/**
 * Fila viva de un predio en core.v_predios_campo (identidad actual, sin zonas).
 * Devuelve null si el predio ya no está habilitado para Campo (p. ej. el
 * expediente avanzó de etapa) — eso NO es un error: las zonas se siguen
 * pudiendo consultar. Lanza solo si la consulta misma falla.
 */
export async function fetchPredioCampo(predioId: string): Promise<PredioCampoRow | null> {
  const { data: filas, error } = await leerPrediosCampo(predioId)
  const data = (filas as unknown as PredioCampoRow[] | null)?.[0] ?? null

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
  // En familias, ni las borradas ni la fila vacía de «Enviar a Campo» (step_completed NULL)
  if (tabla === 'familias') query = query.is('deleted_at', null).not('step_completed', 'is', null)
  const { data, error } = await query.order('created_at', { ascending: true }).limit(1)
  if (error || !data || data.length === 0) return undefined
  return data[0]
}
