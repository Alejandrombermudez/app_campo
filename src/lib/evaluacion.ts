import { db } from '../db/schema'
import type { FamiliaRecord } from '../types/familia'
import type { RevisionRecord } from '../types/revision'
import type { EvaluacionRecord } from '../types/evaluacion'
import { reconciliarZonas } from '../types/evaluacion'
import { zonasVigentes } from './geo'
import { buscarDiligenciamientoPropio, getPredioHabilitadoCache } from './core'
import { hoyLocal } from './fecha'

/**
 * La evaluación de campo (AE-CAMPO-001) de un predio: una por predio y celular.
 *
 * Desde el 2026-10-21 la caracterización biofísica de cada sitio (§3, §4 y §5)
 * se llena desde el editor SIG, sitio por sitio, y el formulario general queda
 * con lo del predio (§1, §2, §6 y firmas). Las dos puertas abren la misma
 * evaluación: si no existe, la crea con lo que la app ya sabe —quién evalúa
 * (el nombre con que entra el celular), la fecha y el código del predio (de
 * jurídica)—, que ya no se teclean.
 */
export type ResultadoEvaluacion =
  | { ok: true; evaluacion: EvaluacionRecord }
  | { ok: false; yaRegistrada: { id: string } }

// Una apertura en curso por predio: dos llamadas casi juntas (un doble toque, o
// React montando dos veces en desarrollo) creaban dos evaluaciones del mismo
// predio, y cada pantalla seguía con una distinta.
const enCurso = new Map<string, Promise<ResultadoEvaluacion>>()

export function abrirEvaluacion(familia: FamiliaRecord, revisiones: RevisionRecord[]): Promise<ResultadoEvaluacion> {
  const previa = enCurso.get(familia.local_id)
  if (previa) return previa
  const p = abrir(familia, revisiones).finally(() => enCurso.delete(familia.local_id))
  enCurso.set(familia.local_id, p)
  return p
}

async function abrir(familia: FamiliaRecord, revisiones: RevisionRecord[]): Promise<ResultadoEvaluacion> {
  const existente = await db.evaluaciones.where('familia_local_id').equals(familia.local_id).first()
  if (existente) return { ok: true, evaluacion: await reconciliar(existente, familia, revisiones) }

  const usuario = localStorage.getItem('ae_campo_user') ?? ''

  // La misma persona no diligencia dos veces el mismo predio, aunque no quede
  // rastro local (otro celular, reinstalación): se mira lo ya sincronizado.
  if (familia.predio_core_id && !familia.es_practica) {
    const propia = await buscarDiligenciamientoPropio('evaluaciones_campo', familia.predio_core_id, usuario)
    if (propia) return { ok: false, yaRegistrada: propia }
  }

  const ph = familia.predio_core_id ? await getPredioHabilitadoCache(familia.predio_core_id) : undefined
  const codigoPredio = ph?.codigo_catastral || ph?.matricula_inmobiliaria || ''
  const fecha = familia.fecha || hoyLocal()
  const ahora = new Date().toISOString()

  const nueva: EvaluacionRecord = {
    local_id:         crypto.randomUUID(),
    familia_local_id: familia.local_id,
    supabase_id:      null,
    sync_status:      'pending',
    sync_error:       null,
    created_at:       ahora,
    updated_at:       ahora,
    step_completed:   0,
    created_by:       usuario,
    nombre_predio:    familia.nombre_predio,
    codigo_predio:    codigoPredio,
    municipio:        familia.municipio,
    fecha_visita:     fecha,
    num_zonas:        0,
    seccion_1: {
      codigo_formato: 'AE-CAMPO-001',
      version:        '1.0',
      fecha_visita:   fecha,
      evaluador_1:    usuario,
      codigo_predio:  codigoPredio,
    },
    seccion_2: {},
    zonas:     [],
    seccion_6: {},
    seccion_7: {},
  }
  nueva.zonas = reconciliarZonas([], zonasVigentes(familia, revisiones))
  nueva.num_zonas = nueva.zonas.length
  // Se vuelve a mirar dentro de la transacción: entre la primera consulta y
  // aquí pudo crearla otra pantalla (o este mismo predio en otra pestaña).
  const ganadora = await db.transaction('rw', db.evaluaciones, async () => {
    const ya = await db.evaluaciones.where('familia_local_id').equals(familia.local_id).first()
    if (ya) return ya
    nueva.id = await db.evaluaciones.add(nueva)
    return nueva
  })
  return { ok: true, evaluacion: ganadora === nueva ? nueva : await reconciliar(ganadora, familia, revisiones) }
}

/** Lleva la lista de sitios de la evaluación al estado vigente del SIG (ver reconciliarZonas). */
export async function reconciliar(ev: EvaluacionRecord, familia: FamiliaRecord, revisiones: RevisionRecord[]): Promise<EvaluacionRecord> {
  const zonas = reconciliarZonas(ev.zonas, zonasVigentes(familia, revisiones))
  if (JSON.stringify(zonas) === JSON.stringify(ev.zonas)) return ev
  const actualizada = { ...ev, zonas, num_zonas: zonas.length, updated_at: new Date().toISOString() }
  await db.evaluaciones.put(actualizada)
  return actualizada
}
