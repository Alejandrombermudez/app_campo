/**
 * Tipo de proyecto de cada sitio de siembra (decisión del usuario, 2026-10-21).
 *
 * Lo elige el técnico al confirmar, corregir o dibujar un sitio. Si el sitio
 * sale de la capa de apoyo, viene sugerido según la clase del shapefile de
 * elegibilidad del SIG, pero no es una muleta: el técnico pone el que ve en
 * terreno, sea cual sea la clase.
 *
 * En el servidor queda en geo.zona_revision.proyecto y en
 * geo.zonas.propiedades->>'proyecto' (RPC geo.anotar_revision_campo,
 * migration_sitios_proyecto.sql), y en la evaluación (ZonaData.proyecto).
 */
export type Proyecto = 'ley_arbol' | 'conexion' | 'pastoreo'

export const PROYECTOS: { id: Proyecto; nombre: string; ayuda: string }[] = [
  { id: 'ley_arbol', nombre: 'Ley del Árbol', ayuda: 'Siembra de nativas (restauración)' },
  { id: 'conexion',  nombre: 'Conexión',      ayuda: 'Mercado voluntario de carbono' },
  { id: 'pastoreo',  nombre: 'Pastoreo',      ayuda: 'Uso sostenible: potrero que sigue en producción' },
]

export const nombreProyecto = (p: Proyecto | null | undefined): string =>
  PROYECTOS.find(x => x.id === p)?.nombre ?? ''

/**
 * Equivalencias de la capa de apoyo (cruce del shapefile Elegibilidad_LDH, 2026-10-21):
 *   Ley del Arbol                          → Ley del Árbol
 *   Mercado voluntario de carbono          → Conexión
 *   No elegible: Cobertura o zonificación  → Pastoreo (todo es Zona de Uso Sostenible)
 * Las demás clases (Otros = bosque y rastrojo, Sin definir = humedales,
 * infraestructura) no sugieren nada.
 */
export function proyectoSugeridoDeClase(clase: string | null | undefined): Proyecto | null {
  const c = (clase ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (c.includes('ley del arbol')) return 'ley_arbol'
  if (c.includes('carbono'))       return 'conexion'
  if (c.includes('no elegible') && c.includes('cobertura')) return 'pastoreo'
  return null
}

/** Cómo se le dice a una clase del shapefile en la app (más corto y en palabras de campo). */
export function etiquetaClase(clase: string | null | undefined): string {
  const p = proyectoSugeridoDeClase(clase)
  if (p === 'pastoreo') return 'Uso sostenible (pastoreo)'
  if (p === 'conexion') return 'Carbono (Conexión)'
  if (p === 'ley_arbol') return 'Ley del Árbol'
  return clase ?? 'Otra'
}
