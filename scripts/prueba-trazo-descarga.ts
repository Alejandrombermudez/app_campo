/* eslint-disable @typescript-eslint/no-explicit-any -- prueba con tablas de mentira */
// Prueba de los dos ajustes del 2026-11-09, sin red (scripts/stubs):
//  1. Filtros del trazado caminando (lib/trazo.ts).
//  2. La descarga de la lista de predios no se cae entera por un predio y trae
//     la fuente (Lácteos del Hogar).
import { db } from '../src/db/schema'
import { respuestas, tablas } from '../src/lib/supabase'
import { evaluarLectura, lecturaVieja } from '../src/lib/trazo'
import { refreshPrediosHabilitados, getEstadoDescarga } from '../src/lib/core'
import { prediosVecinos, vecinoEn } from '../src/lib/vecinos'

let fallas = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK   ' : 'FALLA'} ${m}`); if (!c) fallas++ }

// ── 1. Trazado ──
// 1 grado de latitud ≈ 111 km → 0,0001° ≈ 11 m
const L0 = { lat: 1.6, lon: -75.6 }
const lect = (dlat: number, accuracy: number, t: number) => ({ lat: L0.lat + dlat, lon: L0.lon, accuracy, t })
ok(evaluarLectura(null, lect(0, 8, 0)) === null, 'primer punto con buena precisión entra')
ok(evaluarLectura(null, lect(0, 60, 0)) === 'precision', 'lectura de antena (±60 m) no entra')
ok(evaluarLectura({ ...L0, t: 0 }, lect(0.00001, 5, 2000)) === 'cerca', 'quieto (1 m) no agrega puntos')
ok(evaluarLectura({ ...L0, t: 0 }, lect(0.0001, 5, 5000)) === null, 'caminando 11 m en 5 s entra')
ok(evaluarLectura({ ...L0, t: 0 }, lect(0.001, 5, 2000)) === 'salto', 'salto de 110 m en 2 s se ignora')
ok(evaluarLectura({ ...L0, t: null }, lect(0.001, 5, 2000)) === null, 'al reanudar no se mide la velocidad')
ok(evaluarLectura({ ...L0, t: 0 }, lect(0.00006, 18, 5000)) === 'cerca', 'el paso mínimo crece con la imprecisión (7 m con ±18 m)')
ok(lecturaVieja(lect(0, 5, 0), 20_000) && !lecturaVieja(lect(0, 5, 0), 3000), 'lectura de hace 20 s es vieja')

// ── 1b. Predios vecinos (lib/vecinos.ts) ──
const cuadro = (lon: number, lat: number, d = 0.001) => JSON.stringify({ type: 'Polygon', coordinates: [[[lon, lat], [lon + d, lat], [lon + d, lat + d], [lon, lat + d], [lon, lat]]] })
const ph = (id: string, nombre: string, fuente: string | null, geo: string[]) => ({
  predio_id: id, nombre_predio: nombre, nombre_propietario: 'P', fuente_informacion: fuente,
  zonas_finca: geo.map(g => ({ id: 'f' + id, nombre: null, tipo: 'finca', estado: 'potencial', area_ha: 1, perimetro_m: 1, propiedades: null, geojson: g })),
}) as any
const todos = [ph('a', 'Propio', null, [cuadro(-75.6, 1.6)]), ph('b', 'Vecino LDH', 'lacteos_del_hogar', [cuadro(-75.599, 1.6)]),
  ph('c', 'Sin límite', null, []), ph('d', 'Roto', null, ['{malo'])]
const vec = prediosVecinos(todos, 'a')
ok(vec.length === 1 && vec[0].predio_id === 'b' && vec[0].ldh, 'vecinos: sin el propio, sin los que no tienen límite; marca LDH')
ok(vecinoEn(1.6005, -75.5985, vec)?.nombre === 'Vecino LDH' && vecinoEn(1.6005, -75.5995, vec) === null, 'dice en qué predio vecino se está parado')

// ── 2. Descarga de la lista ──
// Cada descarga «un rato después»: una reciente (< 60 s) se reutilizaría sin bajar.
const ahoraReal = Date.now
let salto = 0
Date.now = () => ahoraReal() + (salto += 120_000)
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
const fila = (id: string, nombre: string, fuente: string | null) => ({
  predio_id: id, expediente_id: 'e' + id, aliado_id: 'a', nombre_predio: nombre, departamento: 'Caquetá', municipio: 'Morelia',
  vereda: 'X', zona_ae: null, matricula_inmobiliaria: null, codigo_catastral: null, nombre_propietario: 'P', tipo_documento: null,
  numero_documento: null, telefono: null, etapa: 'campo', flujo_campo: 'campo_primero', fuente_informacion: fuente,
})
const finca = { id: 'z', nombre: null, tipo: 'finca', estado: 'potencial', area_ha: 1, perimetro_m: 1, propiedades: null, geojson: '{}' }
const vista = [fila('p1', 'Alfa', 'lacteos_del_hogar'), fila('p2', 'Beta', null), fila('p3', 'Gamma', 'lacteos_del_hogar')]
let pidio = ''
tablas.v_predios_campo = cols => { pidio = cols; return { data: vista, error: null } }
respuestas.capas_apoyo_campo = () => ({ data: [], error: null })
respuestas.zonas_de_predio = () => ({ data: [finca], error: null })

let lista = await refreshPrediosHabilitados()
ok(lista.length === 3 && getEstadoDescarga()?.resultado === 'completa', 'descarga completa: 3 predios')
ok(/fuente_informacion/.test(pidio) && lista.filter(p => p.fuente_informacion === 'lacteos_del_hogar').length === 2,
  'trae la fuente: 2 de Lácteos del Hogar')

// p2 falla siempre, p3 falla una vez y luego responde (reintento), y llega un predio nuevo p4 que falla
vista.push(fila('p4', 'Delta', 'lacteos_del_hogar'))
const intentos: Record<string, number> = {}
respuestas.zonas_de_predio = (a: any) => {
  const id = a.p_predio_id as string
  intentos[id] = (intentos[id] ?? 0) + 1
  if (id === 'p2' || id === 'p4' || (id === 'p3' && intentos[id] === 1)) return { data: null, error: { message: 'timeout' } }
  return { data: [finca], error: null }
}
lista = await refreshPrediosHabilitados()
const e = getEstadoDescarga()!
ok(lista.map(p => p.predio_id).sort().join() === 'p1,p2,p3', 'un predio que falla no tumba la lista: quedan p1, p3 y p2 con su copia')
ok(e.resultado === 'parcial' && e.sin_bajar === 1 && e.con_copia_anterior === 1, 'el estado avisa: 1 sin bajar, 1 con copia anterior')
ok(intentos.p3 === 2 && intentos.p2 === 3, 'reintenta cada predio antes de rendirse')
ok((lista.find(p => p.predio_id === 'p2')?.zonas_finca.length ?? 0) === 1, 'la copia anterior conserva sus zonas (nunca vacías por un error)')

// la vista vieja, sin la columna de la migración nueva
tablas.v_predios_campo = cols => /fuente_informacion/.test(cols)
  ? { data: null, error: { code: '42703', message: 'column v_predios_campo.fuente_informacion does not exist' } }
  : { data: vista.slice(0, 1), error: null }
respuestas.zonas_de_predio = () => ({ data: [finca], error: null })
lista = await refreshPrediosHabilitados()
ok(lista.length === 1 && getEstadoDescarga()?.resultado === 'completa', 'sin la migración de la fuente la lista sigue bajando')

// la vista no responde: se queda la copia y se dice
tablas.v_predios_campo = () => ({ data: null, error: { message: 'Failed to fetch' } })
lista = await refreshPrediosHabilitados()
ok(lista.length === 1 && getEstadoDescarga()?.resultado === 'fallida', 'sin respuesta: copia anterior y estado «fallida»')
void db

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo OK')
process.exit(fallas ? 1 : 0)
