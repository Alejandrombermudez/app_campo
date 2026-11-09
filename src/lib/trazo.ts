import { distanciaPuntos } from './geo'

// ─── Trazado caminando: qué lecturas del GPS se vuelven puntos ────────────────
// Reporte de campo (2026-11-09): «no marca bien el track». Hasta entonces solo
// quedaban los puntos que la persona pulsaba, con la lectura que hubiera en ese
// momento (aunque fuera de antena a ±200 m o de hace varios segundos). Ahora el
// recorrido se graba solo al caminar y cada lectura pasa por estos filtros.

export interface LecturaGps {
  lat: number
  lon: number
  accuracy: number   // metros
  t: number          // ms (pos.timestamp)
}

/** Peor precisión que se acepta para un punto automático. */
export const PRECISION_AUTO_M = 20
/** Peor precisión con la que «Marcar punto» no pregunta. */
export const PRECISION_MANUAL_M = 30
/** Distancia mínima entre puntos automáticos: menos que eso es ruido estando quieto. */
export const PASO_MIN_M = 4
/** Más rápido que esto caminando es un salto del GPS, no un paso (≈ 29 km/h). */
export const VELOCIDAD_MAX_MS = 8
/** Una lectura más vieja que esto no sirve para marcar (el GPS se quedó pegado). */
export const LECTURA_VIEJA_MS = 15_000

export type MotivoDescarte = 'precision' | 'cerca' | 'salto' | null

/**
 * ¿Esta lectura se agrega al recorrido automático?
 * `ultimo` es el último punto aceptado (con su hora, si se conoce: al reanudar
 * un trazo guardado no se sabe, y entonces no se mide la velocidad).
 */
export function evaluarLectura(
  ultimo: { lat: number; lon: number; t: number | null } | null,
  l: LecturaGps,
): MotivoDescarte {
  if (!(l.accuracy <= PRECISION_AUTO_M)) return 'precision'
  if (!ultimo) return null
  const d = distanciaPuntos(ultimo.lat, ultimo.lon, l.lat, l.lon)
  // Paso mínimo: nunca menos que la mitad de la precisión, o el ruido dibuja zigzag.
  if (d < Math.max(PASO_MIN_M, l.accuracy / 2)) return 'cerca'
  if (ultimo.t != null && l.t > ultimo.t) {
    const v = d / ((l.t - ultimo.t) / 1000)
    if (v > VELOCIDAD_MAX_MS) return 'salto'
  }
  return null
}

/** La lectura es demasiado vieja para marcar con ella. */
export function lecturaVieja(l: LecturaGps, ahora = Date.now()): boolean {
  return ahora - l.t > LECTURA_VIEJA_MS
}
