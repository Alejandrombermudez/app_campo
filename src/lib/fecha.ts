/**
 * Fecha de hoy (AAAA-MM-DD) en la hora del celular. `toISOString()` da la fecha
 * UTC: en Colombia, de 7 p. m. a medianoche ya sería «mañana» y la visita
 * quedaba con la fecha del día siguiente.
 */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
