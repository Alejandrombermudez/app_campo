/* eslint-disable @typescript-eslint/no-explicit-any -- prueba con tablas de mentira */
// Prueba de la cola sin señal para el límite del predio (flujo «campo primero»),
// con Dexie y Supabase de mentira (scripts/stubs). Nunca sale a la red.
// Correr:  npx rolldown -c scripts/rolldown.pruebas.mjs && node <salida>
import { db } from '../src/db/schema'
import { llamadas, respuestas } from '../src/lib/supabase'
import { syncPendingRevisiones } from '../src/lib/sync'

let fallas = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK   ' : 'FALLA'} ${m}`); if (!c) fallas++ }
const poly = JSON.stringify({ type: 'Polygon', coordinates: [[[-75.6, 1.6], [-75.59, 1.6], [-75.59, 1.61], [-75.6, 1.6]]] })
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })

const base = { familia_local_id: 'f1', predio_core_id: 'p1', metodo: 'gps', geojson: poly, area_ha: 1, observaciones: '',
  zona_numero: 0, sync_error: null, created_by: 'Técnico', fecha: '2026-10-20', created_at: '2026-10-20T10:00:00Z', updated_at: '2026-10-20T10:00:00Z' }

await (db.familias as any).add({ local_id: 'f1', predio_core_id: 'p1', zonas_sig: [], zonas_finca: [], flujo_campo: 'campo_primero' })
await (db.revisiones as any).add({ ...base, local_id: 'lim-1', zona_id: null, accion: 'nueva', tipo: 'finca', sync_status: 'pending' })
await (db.revisiones as any).add({ ...base, local_id: 'sit-1', zona_id: null, accion: 'nueva', tipo: 'restauracion', sync_status: 'pending', created_at: '2026-10-20T10:01:00Z' })

// ── 1. La BD todavía sin migration_campo_primero.sql ──
respuestas.revisar_zona = () => ({ data: 'zona-sitio-1', error: null })
respuestas.zonas_de_predio = () => ({ data: [], error: null })
let r = await syncPendingRevisiones()
const lim = () => (db.revisiones as any).filas.find((x: any) => x.local_id === 'lim-1')
const sit = () => (db.revisiones as any).filas.find((x: any) => x.local_id === 'sit-1')
ok(r.synced === 1 && r.errors === 1, 'sin la migración: el sitio sube y el límite no')
ok(lim().sync_status === 'error' && /migration_campo_primero/.test(lim().sync_error) && lim().geojson === poly,
  'el límite queda en el celular, con el aviso y con su geometría intacta')
ok(llamadas.filter(l => l.fn === 'revisar_zona').length === 1 && llamadas.some(l => l.fn === 'revisar_zona_campo'),
  'el sitio va por revisar_zona y el límite intentó revisar_zona_campo')
ok(sit().sync_status === 'synced' && sit().zona_id === 'zona-sitio-1', 'el sitio quedó sincronizado con el id del servidor')

// ── 2. Corre la migración: el siguiente intento sube el límite ──
llamadas.length = 0
respuestas.revisar_zona_campo = (a) => ({ data: a.p_tipo === 'finca' ? 'zona-limite-1' : null, error: null })
respuestas.zonas_de_predio = () => ({ data: [
  { id: 'zona-limite-1', nombre: null, tipo: 'finca', estado: 'validada', area_ha: 1, perimetro_m: 1, propiedades: null, geojson: poly },
  { id: 'zona-sitio-1', nombre: null, tipo: 'restauracion', estado: 'validada', area_ha: 1, perimetro_m: 1, propiedades: null, geojson: poly },
], error: null })
r = await syncPendingRevisiones()
const llamada = llamadas.find(l => l.fn === 'revisar_zona_campo')
ok(r.synced === 1 && r.errors === 0, 'con la migración: el límite sube en el reintento')
ok(!!llamada && llamada.args.p_tipo === 'finca' && llamada.args.p_accion === 'nueva' && llamada.args.p_metodo === 'gps' && llamada.args.p_local_id === 'lim-1',
  'viaja como tipo finca, acción nueva, método gps y con su local_id (idempotente)')
ok(!llamadas.some(l => l.fn === 'revisar_zona' && l.args.p_local_id === 'sit-1'), 'el sitio ya sincronizado no se vuelve a mandar')
const fam = (db.familias as any).filas[0]
ok(lim().sync_status === 'synced' && lim().zona_id === 'zona-limite-1', 'el límite quedó con su id del servidor')
ok(fam.zonas_finca.length === 1 && fam.zonas_sig.length === 1, 'el refresco trae límite y sitio desde el servidor')

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien')
if (fallas) throw new Error('fallas')
