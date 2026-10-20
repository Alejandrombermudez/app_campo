import { area as turfArea } from '@turf/area'
import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon'
import { bearing as turfBearing } from '@turf/bearing'
import { distance as turfDistance } from '@turf/distance'
import { polygonToLine } from '@turf/polygon-to-line'
import { pointToLineDistance } from '@turf/point-to-line-distance'
import { point, feature, featureCollection, lineString } from '@turf/helpers'
import { centroid as turfCentroid } from '@turf/centroid'
import type { Feature, Geometry, MultiPolygon, Polygon, LineString, MultiLineString } from 'geojson'
import type { FamiliaRecord } from '../types/familia'
import type { ZonaSig } from '../types/core'
import type { RevisionRecord } from '../types/revision'
import { tipoRevision } from '../types/revision'

// ─── Zona tal como se ve HOY en campo: original del SIG + revisiones locales ──
export interface ZonaVigente {
  zona_id: string | null        // null solo en 'nueva' aún sin sincronizar
  zona_numero: number
  nombre: string | null
  geojson: string               // la geometría vigente (corregida si hay revisión)
  area_ha: number | null
  estado_sig: string            // estado en geo.zonas al descargar
  revision: RevisionRecord | null   // última revisión local (si existe)
  descartada: boolean
  /**
   * La zona ya no viene en el snapshot del SIG (el SIG la borró, la descartó o
   * la reemplazó por otra), pero campo alcanzó a trabajarla. Se mantiene
   * visible y marcada — nunca desaparece en silencio. No se evalúa
   * (`zonasActivas` la excluye igual que a una descartada).
   */
  retirada_del_sig?: boolean
}

/**
 * Combina el snapshot del SIG (familia.zonas_sig) con las revisiones locales:
 * geometrías corregidas reemplazan a las originales, las descartadas se marcan,
 * y las zonas nuevas dibujadas en campo se agregan al final.
 */
export function zonasVigentes(familia: FamiliaRecord, revisiones: RevisionRecord[]): ZonaVigente[] {
  const porZona = new Map<string, RevisionRecord>()
  const nuevas: RevisionRecord[] = []
  // La última revisión por zona gana (el usuario puede corregir varias veces).
  // Las del límite del predio van aparte (`limitesVigentes`): si entraran aquí,
  // su zona_id no estaría en zonas_sig y saldrían como un sitio «retirado».
  const deSitios = revisiones.filter(r => tipoRevision(r) === 'restauracion')
  for (const r of [...deSitios].sort((a, b) => a.updated_at.localeCompare(b.updated_at))) {
    if (r.accion === 'nueva' && !r.zona_id) nuevas.push(r)
    else if (r.zona_id) porZona.set(r.zona_id, r)
  }

  const base: ZonaVigente[] = familia.zonas_sig.map((z: ZonaSig, i: number) => {
    const rev = porZona.get(z.zona_id) ?? null
    return {
      zona_id:     z.zona_id,
      zona_numero: i + 1,
      nombre:      z.nombre,
      geojson:     rev?.geojson ?? z.geojson,
      area_ha:     rev?.area_ha ?? z.area_ha,
      estado_sig:  z.estado,
      revision:    rev,
      descartada:  rev?.accion === 'descartada',
    }
  })

  const extra: ZonaVigente[] = nuevas.map(r => ({
    zona_id:     r.zona_id,
    zona_numero: 0,   // se renumera abajo
    nombre:      null,
    geojson:     r.geojson ?? '',
    area_ha:     r.area_ha,
    estado_sig:  'validada',
    revision:    r,
    descartada:  false,
  }))

  // Zonas con trabajo de campo que ya NO están en el snapshot del SIG: pasa
  // cuando el SIG rehace las zonas de siembra y el técnico actualiza el predio
  // en la app. No se borran ni se ocultan — quedan marcadas como retiradas
  // para que se vea qué se trabajó sobre algo que el SIG ya cambió.
  const idsEnSig = new Set(familia.zonas_sig.map(z => z.zona_id))
  const huerfanas: ZonaVigente[] = [...porZona.entries()]
    .filter(([zonaId]) => !idsEnSig.has(zonaId))
    .map(([zonaId, r]) => ({
      zona_id:          zonaId,
      zona_numero:      0,
      nombre:           null,
      geojson:          r.geojson ?? '',
      area_ha:          r.area_ha,
      estado_sig:       'retirada',
      revision:         r,
      descartada:       true,
      retirada_del_sig: true,
    }))

  return [...base, ...extra, ...huerfanas].map((z, i) => ({ ...z, zona_numero: i + 1 }))
}

// ─── Límite del predio tal como se ve HOY en campo ─────────────────────────────
export interface LimiteVigente {
  zona_id: string | null        // null: dibujado en campo y aún sin sincronizar
  numero: number                // 1, 2… (un predio puede venir con varios polígonos)
  geojson: string
  area_ha: number | null
  revision: RevisionRecord | null
  origen: 'sig' | 'campo'       // quién trazó la geometría que se ve
}

/**
 * Límite del predio = snapshot del SIG (`zonas_finca`) + revisiones locales de
 * tipo 'finca'. Mismas reglas que las zonas: la última revisión de cada
 * polígono manda, y una geometría dibujada en campo nunca se pierde por una
 * acción posterior (eso lo garantiza `fusionarRevision` al guardar).
 */
export function limitesVigentes(familia: FamiliaRecord, revisiones: RevisionRecord[]): LimiteVigente[] {
  const deLimite = revisiones
    .filter(r => tipoRevision(r) === 'finca')
    .sort((a, b) => a.updated_at.localeCompare(b.updated_at))
  const porZona = new Map<string, RevisionRecord>()
  const nuevas: RevisionRecord[] = []
  for (const r of deLimite) {
    if (r.accion === 'nueva' && !r.zona_id) nuevas.push(r)
    else if (r.zona_id) porZona.set(r.zona_id, r)
  }
  const fincas = familia.zonas_finca ?? []
  const ids = new Set(fincas.map(f => f.zona_id))
  const base: LimiteVigente[] = fincas.map(f => {
    const rev = porZona.get(f.zona_id) ?? null
    return {
      zona_id: f.zona_id, numero: 0,
      geojson: rev?.geojson ?? f.geojson,
      area_ha: rev?.area_ha ?? f.area_ha,
      revision: rev,
      origen: rev?.geojson ? 'campo' : 'sig',
    }
  })
  // Límite que campo trabajó y ya no viene en el snapshot (p. ej. sincronizado
  // y aún sin refrescar): se sigue viendo, no desaparece.
  const sueltos: LimiteVigente[] = [...porZona.entries()]
    .filter(([id, r]) => !ids.has(id) && !!r.geojson)
    .map(([id, r]) => ({ zona_id: id, numero: 0, geojson: r.geojson!, area_ha: r.area_ha, revision: r, origen: 'campo' as const }))
  const dibujados: LimiteVigente[] = nuevas.map(r => ({
    zona_id: null, numero: 0, geojson: r.geojson ?? '', area_ha: r.area_ha, revision: r, origen: 'campo' as const,
  }))
  return [...base, ...sueltos, ...dibujados]
    .filter(l => l.revision?.accion !== 'descartada' && !!l.geojson)
    .map((l, i) => ({ ...l, numero: i + 1 }))
}

/** Zonas activas (sin descartadas) — lo que la evaluación de campo debe recorrer. */
export function zonasActivas(familia: FamiliaRecord, revisiones: RevisionRecord[]): ZonaVigente[] {
  return zonasVigentes(familia, revisiones).filter(z => !z.descartada && z.geojson)
}

// ─── Geometría ────────────────────────────────────────────────────────────────
export function parseGeom(geojson: string): Feature<Polygon | MultiPolygon> | null {
  try {
    const g = JSON.parse(geojson) as Geometry
    if (g.type !== 'Polygon' && g.type !== 'MultiPolygon') return null
    return feature(g)
  } catch { return null }
}

/** Hectáreas de una geometría GeoJSON (misma fórmula que el servidor: área geodésica). */
export function areaHa(geojson: string): number | null {
  const f = parseGeom(geojson)
  return f ? turfArea(f) / 10000 : null
}

// ─── Posición del técnico respecto a las zonas ───────────────────────────────
export interface PosicionRelativa {
  dentroDe: ZonaVigente | null      // zona en la que está parado (si alguna)
  masCercana: ZonaVigente | null    // la más próxima si está fuera de todas
  distancia_m: number | null        // al borde de la más cercana
  rumbo: string | null              // N/NE/E/SE/S/SO/O/NO hacia la más cercana
}

const RUMBOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const

function rumboTexto(deg: number): string {
  const norm = ((deg % 360) + 360) % 360
  return RUMBOS[Math.round(norm / 45) % 8]
}

export function posicionRespectoZonas(
  lat: number, lon: number, zonas: ZonaVigente[],
): PosicionRelativa {
  const p = point([lon, lat])
  let masCercana: ZonaVigente | null = null
  let minDist = Infinity

  for (const z of zonas) {
    const f = parseGeom(z.geojson)
    if (!f) continue
    if (booleanPointInPolygon(p, f)) {
      return { dentroDe: z, masCercana: null, distancia_m: null, rumbo: null }
    }
    const borde = polygonToLine(f)
    const feats: Feature<LineString | MultiLineString>[] =
      borde.type === 'FeatureCollection' ? borde.features : [borde]
    // pointToLineDistance solo acepta LineString: desarmar MultiLineString
    const lineas: Feature<LineString>[] = feats.flatMap(l =>
      l.geometry.type === 'LineString'
        ? [l as Feature<LineString>]
        : l.geometry.coordinates.map(coords => lineString(coords)),
    )
    for (const linea of lineas) {
      const d = pointToLineDistance(p, linea, { units: 'meters' })
      if (d < minDist) { minDist = d; masCercana = z }
    }
  }

  if (!masCercana) return { dentroDe: null, masCercana: null, distancia_m: null, rumbo: null }

  const f = parseGeom(masCercana.geojson)!
  const rumbo = rumboTexto(turfBearing(p, turfCentroid(f)))
  return { dentroDe: null, masCercana, distancia_m: Math.round(minDist), rumbo }
}

/** Centro aproximado de un conjunto de zonas (para centrar el mapa sin GPS). */
export function centroZonas(geojsons: string[]): [number, number] | null {
  const feats = geojsons.map(parseGeom).filter((f): f is Feature<Polygon | MultiPolygon> => !!f)
  if (!feats.length) return null
  const c = turfCentroid(featureCollection(feats))
  const [lon, lat] = c.geometry.coordinates
  return [lat, lon]
}

/** Distancia legible: "320 m" / "1.4 km". */
export function distanciaTexto(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`
}

/** Distancia entre dos puntos en metros (para saber si el GPS "saltó"). */
export function distanciaPuntos(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return turfDistance(point([lon1, lat1]), point([lon2, lat2]), { units: 'meters' })
}
