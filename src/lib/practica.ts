import type { FamiliaRecord } from '../types/familia'
import type { CapaApoyo, FlujoCampo, ZonaFinca, ZonaSig } from '../types/core'
import { areaHa } from './geo'
import { db } from '../db/schema'
import { hoyLocal } from './fecha'

// ─── Predios de práctica para capacitación ───────────────────────────────────
// No representan predios reales: existen para que cualquiera que abra la app
// tenga con qué ejercitar el trabajo de campo sin depender de Supabase ni de un
// predio de verdad. Nunca se sincronizan (ver guards en lib/sync.ts): sus
// registros se marcan «sincronizados» en el celular sin tocar la red.
//
// Son dos, uno por flujo (2026-10-20):
//   · Práctica 1 — «sig_primero»: el SIG propuso un límite y 3 sitios; se
//     confirman, se corrigen o se descartan.
//   · Práctica 2 — «campo_primero»: no hay propuesta; se dibujan el límite y los
//     sitios desde cero, con una capa de apoyo de ejemplo (áreas elegibles).
// Las geometrías se generan alrededor del primer GPS real del celular, para
// poder caminarlas donde se esté haciendo la capacitación.

const RADIO_TIERRA_M = 111320   // metros por grado de latitud (aprox.)
const LAT_DEFAULT = 1.61, LON_DEFAULT = -75.61   // Florencia, hasta el primer GPS

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

/** Práctica 1: 1 finca + 3 zonas de restauración pequeñas y cercanas, alrededor de (lat, lon). */
export function generarZonasPractica(lat: number, lon: number): { finca: ZonaFinca[]; siembra: ZonaSig[] } {
  const fincaGeojson = poligonoIrregular(lat, lon, 140, 8, 0.15)
  const finca: ZonaFinca[] = [{ zona_id: 'practica-finca', area_ha: areaHa(fincaGeojson), geojson: fincaGeojson }]

  // 3 zonas chicas, en direcciones distintas pero todas cerca del punto GPS
  const offsets = [
    { rumbo: 30,  dist: 70 },
    { rumbo: 160, dist: 75 },
    { rumbo: 270, dist: 65 },
  ]
  const siembra: ZonaSig[] = offsets.map((o, i) => {
    const [cLon, cLat] = puntoDesdeCentro(lat, lon, o.dist, o.rumbo)
    const geojson = poligonoIrregular(cLat, cLon, 32, 6, 0.25)   // ~0,3 ha: que se vea y se pueda caminar
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

/** Práctica 2: capa de apoyo de ejemplo (áreas elegibles) alrededor de (lat, lon). Sin límite ni sitios. */
export function generarCapasPractica(lat: number, lon: number): CapaApoyo[] {
  const areas = [
    { clase: 'Ley del Árbol',                 nombre: 'LA-1',  rumbo: 20,  dist: 70, radio: 50 },
    { clase: 'Ley del Árbol',                 nombre: 'LA-2',  rumbo: 210, dist: 80, radio: 45 },
    { clase: 'Mercado voluntario de carbono', nombre: 'MVC-1', rumbo: 115, dist: 85, radio: 40 },
    { clase: 'No elegible: Cobertura o zonificación', nombre: 'US-1', rumbo: 300, dist: 95, radio: 42 },
  ]
  return areas.map((a, i) => {
    const [cLon, cLat] = puntoDesdeCentro(lat, lon, a.dist, a.rumbo)
    const geojson = poligonoIrregular(cLat, cLon, a.radio, 9, 0.25)
    return { id: `practica-capa-${i + 1}`, capa: 'Ejemplo de capacitación', clase: a.clase, nombre: a.nombre, area_ha: areaHa(geojson), geojson }
  })
}

/** Tipo de un predio de práctica; los que se crearon antes del 2026-10-20 son de verificar al SIG. */
export function tipoPractica(f: Pick<FamiliaRecord, 'practica_tipo'>): FlujoCampo {
  return f.practica_tipo ?? 'sig_primero'
}

/** Geometrías del predio de práctica de ese tipo, alrededor de (lat, lon). */
export function geometriasPractica(tipo: FlujoCampo, lat: number, lon: number): Pick<FamiliaRecord, 'zonas_finca' | 'zonas_sig' | 'num_zonas' | 'capas_apoyo'> {
  if (tipo === 'campo_primero') {
    return { zonas_finca: [], zonas_sig: [], num_zonas: 0, capas_apoyo: generarCapasPractica(lat, lon) }
  }
  const { finca, siembra } = generarZonasPractica(lat, lon)
  return { zonas_finca: finca, zonas_sig: siembra, num_zonas: siembra.length, capas_apoyo: [] }
}

/** Crea la familia local de práctica. Ubicación inicial de respaldo (Florencia,
 * Caquetá) hasta que el módulo SIG la re-centre en el primer GPS real del dispositivo. */
export function crearFamiliaPractica(tipo: FlujoCampo = 'sig_primero'): FamiliaRecord {
  const campoPrimero = tipo === 'campo_primero'
  // «Mis registros» va del más nuevo al más viejo: la Práctica 2 nace un
  // segundo «antes» para que la 1 quede arriba.
  const creado = new Date(Date.now() - (campoPrimero ? 1000 : 0)).toISOString()
  return {
    local_id:           crypto.randomUUID(),
    sync_status:        'synced',   // nunca debe sincronizarse — no es un predio real
    sync_error:         null,
    supabase_id:        null,
    created_at:         creado,
    updated_at:         creado,
    created_by:         localStorage.getItem('ae_campo_user') ?? '',

    // Sentinel no-nulo (no un UUID real): SIG II exige predio_core_id truthy
    // para poder guardar revisiones locales. Nunca llega a una llamada de red
    // real porque lib/sync.ts salta cualquier registro de una familia
    // es_practica ANTES de usar este valor.
    predio_core_id:     'practica',
    expediente_id:      null,

    nombre_predio:      campoPrimero ? 'Práctica 2 · Campo primero' : 'Práctica 1 · Verificar al SIG',
    nombre_propietario: 'Ejercicio de capacitación',
    municipio:          'Práctica',
    vereda:             campoPrimero ? 'Delimitar en terreno' : 'Propuesta del SIG',
    departamento:       '—',
    contacto:           '',

    ...geometriasPractica(tipo, LAT_DEFAULT, LON_DEFAULT),

    fecha: hoyLocal(),
    flujo_campo:      tipo,

    es_practica:      true,
    practica_anclada: false,
    practica_tipo:    tipo,
  }
}

const TIPOS: FlujoCampo[] = ['sig_primero', 'campo_primero']

/**
 * Deja en el celular un predio de práctica de cada tipo (crea el que falte).
 * Transacción 'rw': React StrictMode (dev) invoca el efecto que llama esto dos
 * veces al montar: sin la transacción, ambas pasadas podrían leer «no existe»
 * antes de que la otra insertara, duplicando la práctica.
 */
export async function asegurarPracticas(): Promise<void> {
  await db.transaction('rw', db.familias, async () => {
    const existentes = await db.familias.filter(f => f.es_practica === true).toArray()
    for (const tipo of TIPOS) {
      if (!existentes.some(f => tipoPractica(f) === tipo)) await db.familias.add(crearFamiliaPractica(tipo))
    }
  })
}

/**
 * Empezar de nuevo: borra todo lo que se hizo en ese predio de práctica (sitios,
 * límites, evaluación con sus fotos, encuesta) y lo deja como recién creado.
 * Devuelve el local_id del predio nuevo. Solo para predios de práctica.
 */
export async function reiniciarPractica(familia: FamiliaRecord): Promise<string> {
  if (!familia.es_practica) throw new Error('Solo se reinicia un predio de práctica.')
  const nuevo = crearFamiliaPractica(tipoPractica(familia))
  await db.transaction('rw', [db.familias, db.revisiones, db.decisionesApoyo, db.evaluaciones, db.encuestas, db.photos], async () => {
    for (const ev of await db.evaluaciones.where('familia_local_id').equals(familia.local_id).toArray()) {
      await db.photos.where('local_evaluacion_id').equals(ev.local_id).delete()
      await db.evaluaciones.delete(ev.id!)
    }
    await db.encuestas.where('familia_local_id').equals(familia.local_id).delete()
    await db.revisiones.where('familia_local_id').equals(familia.local_id).delete()
    await db.decisionesApoyo.where('familia_local_id').equals(familia.local_id).delete()
    await db.familias.delete(familia.id!)
    await db.familias.add(nuevo)
  })
  return nuevo.local_id
}
