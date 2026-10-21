// «Supabase» ficticio para las capturas del manual de usuario (y para ensayar la
// app sin tocar la base real). Todo lo que sirve es INVENTADO: predios, dueños,
// geometrías y capas de apoyo de ejemplo. No reenvía nada a Supabase.
//
//   GET  /rest/v1/v_predios_campo          → predios de ejemplo
//   POST /rest/v1/rpc/zonas_de_predio      → sus límites y sitios
//   POST /rest/v1/rpc/capas_apoyo_campo    → capas de apoyo de ejemplo
//   POST /rest/v1/rpc/revisar_zona(_campo) → «ok» con un id nuevo (simula la subida)
//   otros GET                              → []
//   otras escrituras                       → «ok» devolviendo lo enviado con un id
//
// Arranca además el dev server de la app en :5190 apuntando a este servidor.
// Uso: node manual/servidor_manual.mjs   (o la entrada de .claude/launch.json)
import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { FINCA_1, FINCA_2, FINCA_4 } from './centro.mjs'

const PUERTO_API = 54330
const PUERTO_APP = 5190
const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const CENTRO = FINCA_1

const M_POR_GRADO = 111320
function punto(lat, lon, dist, rumbo) {
  const r = (rumbo * Math.PI) / 180
  return [lon + (dist * Math.sin(r)) / (M_POR_GRADO * Math.cos((lat * Math.PI) / 180)), lat + (dist * Math.cos(r)) / M_POR_GRADO]
}
// Polígono estable (sin azar): las capturas salen iguales cada vez.
function poligono(lat, lon, radio, n, forma = [1, 0.85, 1.1, 0.9, 1.05, 0.8, 1.15, 0.95, 1, 0.9]) {
  const c = []
  for (let i = 0; i < n; i++) c.push(punto(lat, lon, radio * forma[i % forma.length], (360 / n) * i))
  c.push(c[0])
  return { type: 'MultiPolygon', coordinates: [[c]] }
}
const desplazar = (dLat, dLon, desde = CENTRO) => ({ lat: desde.lat + dLat, lon: desde.lon + dLon })
const area = (g) => {   // ha aproximadas, suficiente para el ejemplo
  const r = g.coordinates[0][0]; let s = 0
  for (let i = 0; i < r.length - 1; i++) s += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
  return Math.round(Math.abs(s / 2) * M_POR_GRADO * M_POR_GRADO * Math.cos((CENTRO.lat * Math.PI) / 180) / 100) / 100
}

const P = (n) => `00000000-0000-4000-8000-00000000000${n}`
const base = (n, nombre, municipio, vereda, propietario, etapa, flujo) => ({
  predio_id: P(n), expediente_id: P(n).replace('8000', '9000'), aliado_id: P(n).replace('8000', 'a000'),
  nombre_predio: nombre, departamento: 'Caquetá', municipio, vereda, zona_ae: null,
  matricula_inmobiliaria: null, codigo_catastral: null, nombre_propietario: propietario,
  tipo_documento: 'CC', numero_documento: '0000000', telefono: null, etapa,
  updated_at: '2026-10-20T12:00:00Z', flujo_campo: flujo,
})
const PREDIOS = [
  base(1, 'La Esperanza', 'Morelia', 'El Ejemplo', 'Ana Ejemplo Rojas', 'campo', 'sig_primero'),
  base(2, 'El Porvenir', 'Morelia', 'Bajo Ejemplo', 'Pedro Muestra Díaz', 'juridica', 'campo_primero'),
  base(3, 'Los Naranjos', 'Florencia', 'La Prueba', 'Luz Ensayo Pérez', 'juridica', 'campo_primero'),
  base(4, 'Villa Clara', 'Belén de los Andaquíes', 'Alto Ejemplo', 'Jorge Modelo Gil', 'campo', 'sig_primero'),
]

// Geometrías: cada finca alrededor de su punto (las capturas ponen el GPS ahí).
const c1 = FINCA_1, c2 = FINCA_2, c4 = FINCA_4
const ZONAS = {
  [P(1)]: [
    { tipo: 'finca', nombre: 'La Esperanza', geom: poligono(c1.lat, c1.lon, 230, 9) },
    { tipo: 'restauracion', nombre: 'Sitio 1', geom: poligono(...Object.values(desplazar(0.0009, 0.0006)), 70, 7) },
    { tipo: 'restauracion', nombre: 'Sitio 2', geom: poligono(...Object.values(desplazar(-0.0008, 0.0009)), 55, 6) },
    { tipo: 'restauracion', nombre: 'Sitio 3', geom: poligono(...Object.values(desplazar(-0.0004, -0.0011)), 60, 7) },
  ],
  [P(2)]: [{ tipo: 'finca', nombre: 'El Porvenir', geom: poligono(c2.lat, c2.lon, 260, 10) }],
  [P(3)]: [],
  [P(4)]: [
    { tipo: 'finca', nombre: 'Villa Clara', geom: poligono(c4.lat, c4.lon, 200, 8) },
    { tipo: 'restauracion', nombre: 'Sitio 1', geom: poligono(c4.lat + 0.0005, c4.lon, 60, 6) },
  ],
}
const CAPAS = [
  { predio_id: P(2), clase: 'Ley del Árbol', nombre: 'LA-1', geom: poligono(c2.lat + 0.0010, c2.lon - 0.0006, 95, 9) },
  { predio_id: P(2), clase: 'Ley del Árbol', nombre: 'LA-2', geom: poligono(c2.lat - 0.0011, c2.lon + 0.0004, 80, 8) },
  { predio_id: P(2), clase: 'Mercado voluntario de carbono', nombre: 'MVC-1', geom: poligono(c2.lat + 0.0002, c2.lon + 0.0013, 70, 8) },
]

const filasZonas = (predioId) => (ZONAS[predioId] ?? []).map((z, i) => ({
  id: `00000000-0000-4000-c00${predioId.slice(-1)}-0000000000${10 + i}`, nombre: z.nombre, tipo: z.tipo, estado: 'potencial',
  area_ha: area(z.geom), perimetro_m: null, propiedades: null, geojson: JSON.stringify(z.geom),
}))
const filasCapas = () => CAPAS.map((c, i) => ({
  id: `00000000-0000-4000-b000-0000000000${10 + i}`, predio_id: c.predio_id, capa: 'Elegibilidad (ejemplo)',
  clase: c.clase, nombre: c.nombre, area_ha: area(c.geom), geojson: JSON.stringify(c.geom),
}))

const cuerpo = (req) => new Promise(r => { let s = ''; req.on('data', d => s += d); req.on('end', () => r(s)) })
http.createServer(async (req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,PATCH,PUT,DELETE,OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end() }
  const url = new URL(req.url, 'http://local')
  const body = await cuerpo(req)
  const json = (status, data) => { res.writeHead(status, { ...cors, 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)) }

  if (url.pathname === '/rest/v1/v_predios_campo') {
    const eq = url.searchParams.get('predio_id')
    const filas = eq?.startsWith('eq.') ? PREDIOS.filter(p => p.predio_id === eq.slice(3)) : PREDIOS
    if ((req.headers.accept || '').includes('vnd.pgrst.object')) return filas.length ? json(200, filas[0]) : json(406, { code: 'PGRST116' })
    return json(200, filas)
  }
  if (url.pathname === '/rest/v1/rpc/zonas_de_predio') return json(200, filasZonas(JSON.parse(body || '{}').p_predio_id))
  if (url.pathname === '/rest/v1/rpc/capas_apoyo_campo') return json(200, filasCapas())
  if (/^\/rest\/v1\/rpc\/revisar_zona(_campo)?$/.test(url.pathname)) return json(200, randomUUID())
  if (req.method === 'GET' || req.method === 'HEAD') return json(200, [])
  // Escrituras de formularios: «ok» con lo enviado y un id, como respondería Supabase.
  let enviado = {}
  try { enviado = JSON.parse(body || '{}') } catch { /* cuerpo vacío */ }
  const conId = (o) => ({ ...o, id: o.id ?? randomUUID() })
  return json(201, Array.isArray(enviado) ? enviado.map(conId) : [conId(enviado)])
}).listen(PUERTO_API, () => console.log(`[manual] Supabase de ejemplo en http://localhost:${PUERTO_API}`))

const vite = spawn(process.execPath, [path.join(APP, 'node_modules/vite/bin/vite.js'), '--port', String(PUERTO_APP), '--strictPort'], {
  cwd: APP, stdio: 'inherit',
  env: { ...process.env, VITE_SUPABASE_URL: `http://localhost:${PUERTO_API}`, VITE_SUPABASE_ANON_KEY: 'clave-de-ejemplo' },
})
const salir = () => { vite.kill(); process.exit(0) }
process.on('SIGTERM', salir)
process.on('SIGINT', salir)
process.on('exit', () => vite.kill())
