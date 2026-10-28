/**
 * Tipo de proyecto de cada sitio de siembra (decisión del usuario, 2026-10-21;
 * nombres corregidos por el usuario el 2026-10-27).
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
export type Proyecto = 'ley_arbol' | 'mercado_carbono' | 'ganaderia_sostenible'

export const PROYECTOS: { id: Proyecto; nombre: string; ayuda: string }[] = [
  { id: 'ley_arbol',            nombre: 'Ley del Árbol',                 ayuda: 'Siembra de nativas (restauración)' },
  { id: 'mercado_carbono',      nombre: 'Mercado voluntario de carbono', ayuda: 'Proyecto de carbono' },
  { id: 'ganaderia_sostenible', nombre: 'Ganadería sostenible',          ayuda: 'Potrero que sigue en producción, con uso sostenible' },
]

/**
 * Entre el 2026-10-21 y el 27 la app guardó estos dos con otro nombre
 * ('conexion', 'pastoreo'). Lo que quedó así en un celular se lee con el nombre
 * de hoy; el servidor hace la misma traducción (geo.anotar_revision_campo).
 */
const NOMBRE_ANTERIOR: Record<string, Proyecto> = { conexion: 'mercado_carbono', pastoreo: 'ganaderia_sostenible' }

export function normalizarProyecto(p: string | null | undefined): Proyecto | null {
  if (!p) return null
  if (PROYECTOS.some(x => x.id === p)) return p as Proyecto
  return NOMBRE_ANTERIOR[p] ?? null
}

export const nombreProyecto = (p: string | null | undefined): string =>
  PROYECTOS.find(x => x.id === normalizarProyecto(p))?.nombre ?? ''

/**
 * Equivalencias de la capa de apoyo (shapefile Elegibilidad_LDH): a la izquierda
 * el nombre de la clase en la capa, a la derecha el tipo de proyecto.
 *   Ley del Arbol                          → Ley del Árbol
 *   Mercado voluntario de carbono          → Mercado voluntario de carbono
 *   No elegible: Cobertura o zonificación  → Ganadería sostenible
 * Las demás clases (Otros = bosque y rastrojo, Sin definir = humedales,
 * No elegible: infraestructura) no sugieren ningún proyecto.
 */
export function proyectoSugeridoDeClase(clase: string | null | undefined): Proyecto | null {
  const c = (clase ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (c.includes('ley del arbol')) return 'ley_arbol'
  if (c.includes('carbono'))       return 'mercado_carbono'
  if (c.includes('no elegible') && c.includes('cobertura')) return 'ganaderia_sostenible'
  return null
}

/** Cómo se le dice a una clase del shapefile en la app: el nombre del proyecto, o la clase tal cual. */
export function etiquetaClase(clase: string | null | undefined): string {
  const p = proyectoSugeridoDeClase(clase)
  return p ? nombreProyecto(p) : (clase ?? 'Otra')
}
