import type { FamiliaRecord } from '../types/familia'
import type { ZonaFinca, ZonaSig } from '../types/core'
import { areaHa } from './geo'

// ─── Predio de práctica para capacitación ────────────────────────────────────
// No representa un predio real: existe solo para que cualquiera que abra la
// app tenga algo con qué ejercitar SIG II (corregir/borrar límites) sin
// depender de Supabase ni de un predio habilitado de verdad. Nunca se
// sincroniza (ver guards en lib/sync.ts).

const RADIO_TIERRA_M = 111320   // metros por grado de latitud (aprox.)

/** Punto a `distanciaM` metros de (lat,lon), en dirección `rumboDeg` (0=N, 90=E). */
function puntoDesdeCentro(lat: number, lon: number, distanciaM: number, rumboDeg: number): [number, number] {
  const rad = (rumboDeg * Math.PI) / 180
  const dLat = (distanciaM * Math.cos(rad)) / RADIO_TIERRA_M
  const dLon = (distanciaM * Math.sin(rad)) / (RADIO_TIERRA_M * Math.cos((lat * Math.PI) / 180))
  return [lon + dLon, lat + dLat]   // GeoJSON = [lon, lat]
}

/** Polígono irregular (no un cuadrado perfecto) para practicar arrastrar/agregar/quitar vértices. */
function poligonoIrregular(lat: number, lon: number, radioBaseM: number, nVertices: number, jitter: number): string {
  const coords: [number, number][] = []
  for (let i = 0; i < nVertices; i++) {
    const rumbo = (360 / nVertices) * i
    const r = radioBaseM * (1 + (Math.random() * 2 - 1) * jitter)
    coords.push(puntoDesdeCentro(lat, lon, r, rumbo))
  }
  coords.push(coords[0])
  return JSON.stringify({ type: 'Polygon', coordinates: [coords] })
}

/** Genera 1 finca + 3 zonas de restauración pequeñas y cercanas, alrededor de (lat, lon). */
export function generarZonasPractica(lat: number, lon: number): { finca: ZonaFinca[]; siembra: ZonaSig[] } {
  const fincaGeojson = poligonoIrregular(lat, lon, 100, 8, 0.15)
  const finca: ZonaFinca[] = [{ zona_id: 'practica-finca', area_ha: areaHa(fincaGeojson), geojson: fincaGeojson }]

  // 3 zonas chicas, en direcciones distintas pero todas cerca del punto GPS
  const offsets = [
    { rumbo: 30,  dist: 40 },
    { rumbo: 160, dist: 45 },
    { rumbo: 260, dist: 35 },
  ]
  const siembra: ZonaSig[] = offsets.map((o, i) => {
    const [cLon, cLat] = puntoDesdeCentro(lat, lon, o.dist, o.rumbo)
    const geojson = poligonoIrregular(cLat, cLon, 15, 6, 0.3)
    return {
      zona_id:     `practica-zona-${i + 1}`,
      nombre:      `Zona de práctica ${i + 1}`,
      tipo:        'restauracion',
      estado:      'potencial',
      area_ha:     areaHa(geojson),
      perimetro_m: null,
      geojson,
    }
  })

  return { finca, siembra }
}

/** Crea la familia local de práctica. Ubicación inicial de respaldo (Florencia,
 * Caquetá) hasta que el módulo SIG la re-centre en el primer GPS real del dispositivo. */
export function crearFamiliaPractica(): FamiliaRecord {
  const LAT_DEFAULT = 1.61, LON_DEFAULT = -75.61
  const { finca, siembra } = generarZonasPractica(LAT_DEFAULT, LON_DEFAULT)

  return {
    local_id:           crypto.randomUUID(),
    sync_status:        'synced',   // nunca debe sincronizarse — no es un predio real
    sync_error:         null,
    supabase_id:        null,
    created_at:         new Date().toISOString(),
    updated_at:         new Date().toISOString(),
    created_by:         localStorage.getItem('ae_campo_user') ?? '',

    // Sentinel no-nulo (no un UUID real): SIG II exige predio_core_id truthy
    // para poder guardar revisiones locales. Nunca llega a una llamada de red
    // real porque lib/sync.ts salta cualquier registro de una familia
    // es_practica ANTES de usar este valor.
    predio_core_id:     'practica',
    expediente_id:      null,

    nombre_predio:      'Predio de práctica (capacitación)',
    nombre_propietario: 'Ejercicio de entrenamiento',
    municipio:          'Práctica',
    vereda:             '—',
    departamento:       '—',
    contacto:           '',

    zonas_sig:   siembra,
    zonas_finca: finca,
    num_zonas:   siembra.length,

    fecha: new Date().toISOString().slice(0, 10),

    es_practica:      true,
    practica_anclada: false,
  }
}
