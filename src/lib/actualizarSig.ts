// ─── Actualizar un predio ya descargado contra el SIG ─────────────────────────
//
// Caso real: el técnico descarga el predio, y días después el SIG rehace el
// límite de la finca o las zonas de siembra. La app trabaja sobre un snapshot
// (familia.zonas_sig / zonas_finca) que no se entera solo.
//
// Este módulo separa la operación en DOS pasos, a propósito:
//   1. `consultarCambiosSig`  → SOLO LEE. Descarga el estado del SIG y arma un
//      resumen de qué cambiaría. No escribe absolutamente nada en el
//      dispositivo. Si no hay señal (o hay señal falsa: conectado a la antena
//      pero sin datos), falla aquí y no pasa nada.
//   2. `aplicarCambiosSig`    → escribe, y solo después de que la persona
//      confirmó viendo el resumen.
//
// Un toque accidental del botón nunca escribe: llega al paso 1 y ahí para.
//
// Qué NO toca este módulo, nunca:
//   · db.revisiones     — las correcciones de zonas hechas en campo (SIG II).
//   · db.evaluaciones   — el formato biofísico ya diligenciado.
//   · db.encuestas      — la encuesta predial.
//   · db.photos         — fotos y firmas.
// Solo reemplaza el snapshot de geometrías de la familia. Que el trabajo
// asociado a una zona que el SIG retiró siga visible lo garantizan
// `zonasVigentes` (lib/geo.ts) y `reconciliarZonas` (types/evaluacion.ts).

import { db } from '../db/schema'
import { fetchZonasPredio, fetchPredioCampo, type PredioCampoRow } from './core'
import type { ZonaSig, ZonaFinca } from '../types/core'
import type { FamiliaRecord } from '../types/familia'

/** Corte para no dejar a alguien mirando un spinner con señal de 1 raya. */
const TIMEOUT_MS = 20_000

export type TipoCambio = 'modificada' | 'agregada' | 'retirada'

export interface CambioZona {
  tipo: TipoCambio
  zona_id: string
  etiqueta: string              // "Zona 2" / "Zona nueva"
  area_antes: number | null
  area_despues: number | null
  /** Hay una corrección local de esta zona sin sincronizar (se conserva). */
  revisionPendiente: boolean
  /** La evaluación de campo ya tiene datos de esta zona (se conservan). */
  datosCapturados: boolean
}

export interface DiffSig {
  zonasRemotas: ZonaSig[]
  fincaRemota:  ZonaFinca[]
  identidad:    PredioCampoRow | null
  cambios:      CambioZona[]
  fincaCambio:  boolean
  hayCambios:   boolean
  /** Motivo por el que NO se debe aplicar nada (null = se puede aplicar). */
  bloqueo: string | null
  /** Cosas que la persona debe saber antes de confirmar. */
  advertencias: string[]
}

export type MotivoFallo = 'sin_conexion' | 'fallo_red' | 'no_aplica'

export type ResultadoConsulta =
  | { ok: true;  diff: DiffSig }
  | { ok: false; motivo: MotivoFallo; mensaje: string }

// ─── Utilidades ───────────────────────────────────────────────────────────────

function conTiempoLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('TIEMPO_AGOTADO')), ms)
    p.then(v => { clearTimeout(t); resolve(v) },
           e => { clearTimeout(t); reject(e) })
  })
}

/** ¿Dos geometrías GeoJSON son la misma? (comparación tolerante a formato) */
function mismaGeometria(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  try {
    return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b))
  } catch {
    return false
  }
}

function areaCambio(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return a !== b
  return Math.abs(a - b) > 0.005   // media centésima de hectárea = ruido de cálculo
}

// ─── Paso 1: consultar (solo lectura) ─────────────────────────────────────────

/**
 * Descarga el estado actual del SIG para este predio y lo compara con lo que
 * hay en el dispositivo. NO escribe nada. Devuelve `ok:false` con un motivo
 * legible cuando no se puede hacer (sin señal, predio de práctica, etc.).
 */
export async function consultarCambiosSig(familia: FamiliaRecord): Promise<ResultadoConsulta> {
  if (familia.es_practica) {
    return {
      ok: false, motivo: 'no_aplica',
      mensaje: 'Este es el predio de práctica: no existe en el SIG y no se actualiza.',
    }
  }
  if (!familia.predio_core_id) {
    return {
      ok: false, motivo: 'no_aplica',
      mensaje: 'Este registro no está enlazado a un predio del SIG, no hay de dónde actualizarlo.',
    }
  }
  if (!navigator.onLine) {
    return {
      ok: false, motivo: 'sin_conexion',
      mensaje: 'Sin internet. No se consultó nada y no se cambió nada en el celular.',
    }
  }

  let zonasRemotas: ZonaSig[]
  let fincaRemota:  ZonaFinca[]
  let identidad:    PredioCampoRow | null

  try {
    // navigator.onLine solo dice que hay red, no que haya datos: la consulta
    // real es la única prueba. Si falla o se demora, se aborta sin escribir.
    const [zonas, fila] = await conTiempoLimite(Promise.all([
      fetchZonasPredio(familia.predio_core_id),
      fetchPredioCampo(familia.predio_core_id).catch(() => null),
    ]), TIMEOUT_MS)
    zonasRemotas = zonas.siembra
    fincaRemota  = zonas.finca
    identidad    = fila
  } catch (err) {
    const agotado = err instanceof Error && err.message === 'TIEMPO_AGOTADO'
    return {
      ok: false, motivo: 'fallo_red',
      mensaje: agotado
        ? 'La señal no alcanzó para consultar al SIG. No se cambió nada en el celular — vuelve a intentarlo donde haya mejor señal.'
        : 'No se pudo consultar al SIG. No se cambió nada en el celular — vuelve a intentarlo cuando tengas señal.',
    }
  }

  // ─── Qué hay trabajado localmente sobre cada zona ────────────────────────────
  const [revisiones, evaluacion] = await Promise.all([
    db.revisiones.where('familia_local_id').equals(familia.local_id).toArray(),
    db.evaluaciones.where('familia_local_id').equals(familia.local_id).first(),
  ])

  const revPendientePorZona = new Set(
    revisiones.filter(r => r.sync_status !== 'synced' && r.zona_id).map(r => r.zona_id as string),
  )
  const conDatosPorZona = new Set(
    (evaluacion?.zonas ?? [])
      .filter(z => z.zona_id && (
        Object.keys(z.cobertura ?? {}).length > 0 ||
        Object.keys(z.suelo ?? {}).length > 0 ||
        Object.keys(z.logistica ?? {}).length > 0
      ))
      .map(z => z.zona_id as string),
  )

  // ─── Diff de zonas de siembra ────────────────────────────────────────────────
  const localesPorId  = new Map(familia.zonas_sig.map(z => [z.zona_id, z]))
  const remotasPorId  = new Map(zonasRemotas.map(z => [z.zona_id, z]))
  const numeroLocal   = new Map(familia.zonas_sig.map((z, i) => [z.zona_id, i + 1]))
  const cambios: CambioZona[] = []

  for (const [i, remota] of zonasRemotas.entries()) {
    const local = localesPorId.get(remota.zona_id)
    if (!local) {
      cambios.push({
        tipo: 'agregada', zona_id: remota.zona_id,
        etiqueta: remota.nombre?.trim() || `Zona nueva ${i + 1}`,
        area_antes: null, area_despues: remota.area_ha,
        revisionPendiente: false, datosCapturados: false,
      })
      continue
    }
    if (mismaGeometria(local.geojson, remota.geojson) && !areaCambio(local.area_ha, remota.area_ha)) continue
    cambios.push({
      tipo: 'modificada', zona_id: remota.zona_id,
      etiqueta: `Zona ${numeroLocal.get(remota.zona_id) ?? i + 1}`,
      area_antes: local.area_ha, area_despues: remota.area_ha,
      revisionPendiente: revPendientePorZona.has(remota.zona_id),
      datosCapturados:   conDatosPorZona.has(remota.zona_id),
    })
  }

  for (const local of familia.zonas_sig) {
    if (remotasPorId.has(local.zona_id)) continue
    cambios.push({
      tipo: 'retirada', zona_id: local.zona_id,
      etiqueta: `Zona ${numeroLocal.get(local.zona_id) ?? '?'}`,
      area_antes: local.area_ha, area_despues: null,
      revisionPendiente: revPendientePorZona.has(local.zona_id),
      datosCapturados:   conDatosPorZona.has(local.zona_id),
    })
  }

  // ─── Diff del límite de la finca ─────────────────────────────────────────────
  const fincaCambio =
    fincaRemota.length !== familia.zonas_finca.length ||
    fincaRemota.some((f, i) => !mismaGeometria(f.geojson, familia.zonas_finca[i]?.geojson))

  // ─── Bloqueos y advertencias ─────────────────────────────────────────────────
  let bloqueo: string | null = null
  if (zonasRemotas.length === 0) {
    // Defensa dura: el SIG respondió "cero zonas". Aplicar eso dejaría el
    // predio sin nada que evaluar. Se prefiere no tocar y avisar.
    bloqueo = 'El SIG respondió que este predio no tiene zonas de siembra. No se actualizó nada — repórtalo al equipo SIG antes de seguir.'
  }

  const advertencias: string[] = []
  const retiradasConTrabajo = cambios.filter(c => c.tipo === 'retirada' && (c.datosCapturados || c.revisionPendiente))
  if (retiradasConTrabajo.length) {
    advertencias.push(
      `${retiradasConTrabajo.length === 1 ? 'Hay 1 zona que ya trabajaste y el SIG retiró' : `Hay ${retiradasConTrabajo.length} zonas que ya trabajaste y el SIG retiró`}: lo diligenciado se conserva, queda marcado como "retirada del SIG".`,
    )
  }
  const modificadasConRevision = cambios.filter(c => c.tipo === 'modificada' && c.revisionPendiente)
  if (modificadasConRevision.length) {
    advertencias.push(
      'Tienes correcciones de límite sin sincronizar sobre zonas que el SIG también cambió. Tu corrección sigue mandando en el mapa; si prefieres la versión del SIG, sincroniza primero y luego usa "Deshacer" en el módulo SIG.',
    )
  }
  const pendientesTotal = revisiones.filter(r => r.sync_status !== 'synced').length
  if (pendientesTotal > 0 && !modificadasConRevision.length) {
    advertencias.push(`Tienes ${pendientesTotal} cambio(s) de zonas sin sincronizar. No se pierden, pero conviene sincronizar antes.`)
  }

  return {
    ok: true,
    diff: {
      zonasRemotas, fincaRemota, identidad, cambios, fincaCambio,
      hayCambios: cambios.length > 0 || fincaCambio,
      bloqueo, advertencias,
    },
  }
}

// ─── Paso 2: aplicar (escribe, solo tras confirmación) ────────────────────────

/**
 * Reemplaza el snapshot de geometrías de la familia por el que trae el diff.
 * Solo debe llamarse con un `diff` recién obtenido de `consultarCambiosSig` y
 * con `bloqueo === null`. No borra revisiones, evaluaciones ni encuestas.
 */
export async function aplicarCambiosSig(familia: FamiliaRecord, diff: DiffSig): Promise<void> {
  if (diff.bloqueo) throw new Error(diff.bloqueo)
  if (familia.es_practica) throw new Error('El predio de práctica no se actualiza desde el SIG.')

  const ahora = new Date().toISOString()

  // Sin cambios: solo se deja constancia de que se revisó (no se remueve el
  // predio de su lugar en la lista tocando updated_at sin motivo).
  if (!diff.hayCambios) {
    await db.familias.update(familia.id!, { sig_actualizado_at: ahora })
    return
  }

  await db.familias.update(familia.id!, {
    zonas_sig:          diff.zonasRemotas,
    zonas_finca:        diff.fincaRemota,
    num_zonas:          diff.zonasRemotas.length,
    // La identidad también es snapshot de core; si el predio ya no aparece en
    // la vista (cambió de etapa) se deja la que había, no se borra.
    ...(diff.identidad ? {
      nombre_predio:      diff.identidad.nombre_predio,
      nombre_propietario: diff.identidad.nombre_propietario,
      municipio:          diff.identidad.municipio,
      vereda:             diff.identidad.vereda,
      departamento:       diff.identidad.departamento,
      contacto:           diff.identidad.telefono ?? familia.contacto,
    } : {}),
    sig_actualizado_at: ahora,
    updated_at:         ahora,
  })
}
