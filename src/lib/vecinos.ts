import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
import type { PredioHabilitado } from '../types/core'
import { parseGeom } from './geo'

// ─── Predios vecinos en el mapa ───────────────────────────────────────────────
// Pedido de campo (2026-11-13): ver los predios de alrededor, sea cual sea el
// que se tenga abierto, para saber dónde termina uno y empieza el otro (sobre
// todo entre los de Lácteos del Hogar, que son muchos y pegados). Sale de la
// copia local de predios habilitados — el límite de finca del SIG de cada uno —,
// así que funciona sin señal y no necesita nada nuevo en la base.

export const FUENTE_LDH = 'lacteos_del_hogar'

export interface PredioVecino {
  predio_id: string
  nombre: string
  propietario: string
  ldh: boolean
  limites: Feature<Polygon | MultiPolygon>[]
}

/** Todos los predios con límite de finca, menos el que está abierto. */
export function prediosVecinos(todos: PredioHabilitado[], propioId: string | null | undefined): PredioVecino[] {
  const out: PredioVecino[] = []
  for (const p of todos) {
    if (p.predio_id === propioId) continue
    const limites = (p.zonas_finca ?? []).map(z => parseGeom(z.geojson)).filter((f): f is Feature<Polygon | MultiPolygon> => !!f)
    if (!limites.length) continue
    out.push({
      predio_id: p.predio_id,
      nombre: p.nombre_predio,
      propietario: p.nombre_propietario,
      ldh: p.fuente_informacion === FUENTE_LDH,
      limites,
    })
  }
  return out
}

/** El predio vecino en el que está parada la persona, si alguno. */
export function vecinoEn(lat: number, lon: number, vecinos: PredioVecino[]): PredioVecino | null {
  const p = point([lon, lat])
  for (const v of vecinos) {
    if (v.limites.some(f => booleanPointInPolygon(p, f))) return v
  }
  return null
}
