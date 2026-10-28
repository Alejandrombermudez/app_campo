/* eslint-disable @typescript-eslint/no-explicit-any -- prueba con tablas de mentira */
// Prueba del tipo de proyecto por sitio, la caracterización por sitio y la capa
// de apoyo que se trabaja (2026-10-21), con Dexie y Supabase de mentira
// (scripts/stubs). Nunca sale a la red.
import { db } from '../src/db/schema'
import { llamadas, respuestas } from '../src/lib/supabase'
import { syncPendingRevisiones, syncAnotacionesPendientes, syncPendingDecisionesApoyo } from '../src/lib/sync'
import { fusionarRevision, type RevisionRecord } from '../src/types/revision'
import { estadoCaracterizacion, prefijoFotos, reconciliarZonas, claveSitio } from '../src/types/evaluacion'
import { proyectoSugeridoDeClase, etiquetaClase } from '../src/lib/proyectos'
import { zonasVigentes } from '../src/lib/geo'

let fallas = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK   ' : 'FALLA'} ${m}`); if (!c) fallas++ }
const poly = JSON.stringify({ type: 'Polygon', coordinates: [[[-75.6, 1.6], [-75.59, 1.6], [-75.59, 1.61], [-75.6, 1.6]]] })
const otra = JSON.stringify({ type: 'Polygon', coordinates: [[[-75.7, 1.6], [-75.69, 1.6], [-75.69, 1.61], [-75.7, 1.6]]] })
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true })
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => 'Técnico' }, configurable: true })

// ── 1. Equivalencias de la capa de apoyo ──────────────────────────────────────
ok(proyectoSugeridoDeClase('Ley del Arbol') === 'ley_arbol' && proyectoSugeridoDeClase('Ley del Árbol') === 'ley_arbol', 'Ley del Árbol → Ley del Árbol (con y sin tilde)')
ok(proyectoSugeridoDeClase('Mercado voluntario de carbono') === 'mercado_carbono', 'carbono → Mercado voluntario de carbono')
ok(proyectoSugeridoDeClase('No elegible: Cobertura o zonificación') === 'ganaderia_sostenible', 'no elegible por cobertura o zonificación → Ganadería sostenible')
ok(proyectoSugeridoDeClase('No elegible: infraestructura') === null && proyectoSugeridoDeClase('Otros') === null && proyectoSugeridoDeClase(null) === null,
  'infraestructura, otros y vacío no sugieren nada')
ok(etiquetaClase('No elegible: Cobertura o zonificación') === 'Ganadería sostenible', 'la clase de la capa se muestra con el nombre del proyecto (corrección del 2026-10-27)')
ok(etiquetaClase('Sin definir') === 'Sin definir' && etiquetaClase('No elegible: infraestructura') === 'No elegible: infraestructura', 'las clases sin proyecto se muestran tal cual')

// ── 2. El tipo de proyecto no se pierde al fusionar revisiones ────────────────
const previa = { accion: 'modificada', metodo: 'vertices', geojson: otra, area_ha: 2, proyecto: 'ganaderia_sostenible' } as RevisionRecord
let f = fusionarRevision(previa, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null })
ok(f.accion === 'modificada' && f.geojson === otra && f.proyecto === 'ganaderia_sostenible', 'confirmar un sitio corregido conserva la corrección y el proyecto')
f = fusionarRevision(previa, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null, proyecto: 'ley_arbol' })
ok(f.proyecto === 'ley_arbol' && f.geojson === otra, 'elegir otro proyecto lo cambia sin tocar la geometría')

// ── 3. Caracterización por sitio ─────────────────────────────────────────────
ok(estadoCaracterizacion({ cobertura: {}, suelo: {}, logistica: {} }) === 'pendiente', 'sitio sin datos: sin caracterizar')
ok(estadoCaracterizacion({ cobertura: { cobertura_dominante: 'Pastizal' }, suelo: {}, logistica: {} }) === 'en_curso', 'con algo: a medias')
ok(estadoCaracterizacion({
  cobertura: { cobertura_dominante: 'Pastizal', pct_cobertura_boscosa: '< 10%', regeneracion_natural: 'Escasa' },
  suelo: { textura_suelo: 'Arcilloso', drenaje_superficial: 'Bueno', pendiente: 'Plano', erosion: 'No' },
  logistica: { medio_acceso_zonas: ['A pie'], condicion_camino: 'Transitable todo el año' },
}) === 'completa', 'con lo mínimo de las tres pestañas: caracterizado')
ok(estadoCaracterizacion({ cobertura: {}, suelo: {}, logistica: { medio_acceso_zonas: [] } }) === 'pendiente', 'una lista vacía no cuenta como dato')
ok(prefijoFotos({ zona_numero: 2 }) === 'zona_2' && prefijoFotos({ zona_numero: 2, foto_clave: 'sitio_x' }) === 'sitio_x',
  'las fotos de antes siguen con su número; las nuevas, con la clave del sitio')

// ── 4. La evaluación toma el proyecto del sitio y conserva su clave de fotos ──
const familia: any = { local_id: 'f1', predio_core_id: 'p1', zonas_finca: [], flujo_campo: 'sig_primero',
  zonas_sig: [{ zona_id: 'z1', nombre: 'S1', tipo: 'restauracion', estado: 'potencial', area_ha: 1, perimetro_m: null, geojson: poly }] }
const revs: any[] = [{ local_id: 'r1', familia_local_id: 'f1', zona_id: 'z1', accion: 'confirmada', tipo: 'restauracion', geojson: null,
  proyecto: 'conexion', sync_status: 'pending', created_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z' }]
const vig = zonasVigentes(familia, revs)
const zonas = reconciliarZonas([{ zona_id: 'z1', zona_numero: 1, area_ha_sig: 1, cobertura: { cobertura_dominante: 'Pastizal' }, suelo: {}, logistica: {}, foto_clave: 'sitio_abc' }], vig)
ok(zonas[0].proyecto === 'mercado_carbono' && zonas[0].foto_clave === 'sitio_abc' && zonas[0].cobertura.cobertura_dominante === 'Pastizal',
  'la evaluación refleja el proyecto del sitio sin perder lo capturado ni la clave de fotos')
ok(claveSitio(vig[0]) === 'z1', 'la llave del sitio es su zona_id')

// ── 5. Sync: la geometría sube aunque el servidor no reciba el proyecto todavía ─
const capaId = '11111111-2222-3333-4444-555555555555'
await (db.familias as any).add({ local_id: 'f1', predio_core_id: 'p1', zonas_sig: [], zonas_finca: [], flujo_campo: 'campo_primero' })
await (db.revisiones as any).add({ local_id: 'nv-1', familia_local_id: 'f1', predio_core_id: 'p1', zona_id: null, accion: 'nueva', tipo: 'restauracion',
  metodo: 'nueva', geojson: poly, area_ha: 1, observaciones: '', zona_numero: 0, sync_status: 'pending', sync_error: null,
  created_by: 'Técnico', fecha: '2026-10-21', created_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z',
  proyecto: 'pastoreo', capa_apoyo_id: capaId })
respuestas.revisar_zona = () => ({ data: 'zona-nueva-1', error: null })
respuestas.zonas_de_predio = () => ({ data: [], error: null })
const r = await syncPendingRevisiones()
const nv = () => (db.revisiones as any).filas.find((x: any) => x.local_id === 'nv-1')
ok(r.synced === 1 && r.errors === 0 && nv().sync_status === 'synced' && nv().zona_id === 'zona-nueva-1', 'sin la migración: el sitio sube igual')
ok(nv().anotacion_sync === 'pendiente', 'y el tipo de proyecto queda pendiente de anotar')

llamadas.length = 0
respuestas.anotar_revision_campo = () => ({ data: true, error: null })
const a = await syncAnotacionesPendientes()
const an = llamadas.find(l => l.fn === 'anotar_revision_campo')
ok(a.synced === 1 && nv().anotacion_sync === 'synced', 'con la migración: el proyecto se anota en el reintento')
ok(!!an && an.args.p_local_id === 'nv-1' && an.args.p_proyecto === 'ganaderia_sostenible' && an.args.p_capa_apoyo_id === capaId,
  'viaja con su local_id, el proyecto y el área de origen')
ok(!llamadas.some(l => l.fn === 'revisar_zona'), 'la geometría no se vuelve a mandar')

// Área de práctica (id que no es uuid): el proyecto se anota, el área no.
await (db.revisiones as any).add({ ...nv(), id: undefined, local_id: 'nv-2', anotacion_sync: null, sync_status: 'pending', capa_apoyo_id: 'practica-capa-1', zona_id: null })
llamadas.length = 0
respuestas.revisar_zona = () => ({ data: 'zona-nueva-2', error: null })
await syncPendingRevisiones()
const an2 = llamadas.find(l => l.fn === 'anotar_revision_campo')
ok(!!an2 && an2.args.p_capa_apoyo_id === null && an2.args.p_proyecto === 'ganaderia_sostenible', 'un área que no es de la base no viaja como origen')

// ── 6. Rechazar un área de la capa de apoyo ──────────────────────────────────
await (db.decisionesApoyo as any).add({ local_id: 'dc-1', familia_local_id: 'f1', predio_core_id: 'p1', capa_apoyo_id: capaId, accion: 'descartada',
  observaciones: 'Es humedal', created_by: 'Técnico', fecha: '2026-10-21', sync_status: 'pending', sync_error: null,
  created_at: '2026-10-21T10:00:00Z', updated_at: '2026-10-21T10:00:00Z' })
let d = await syncPendingDecisionesApoyo()
const dc = () => (db.decisionesApoyo as any).filas.find((x: any) => x.local_id === 'dc-1')
ok(d.errors === 1 && dc().sync_status === 'error' && /migration_sitios_proyecto/.test(dc().sync_error), 'sin la migración: el rechazo queda en el celular con el aviso')
llamadas.length = 0
respuestas.revisar_capa_apoyo = () => ({ data: 'srv-1', error: null })
d = await syncPendingDecisionesApoyo()
const rc = llamadas.find(l => l.fn === 'revisar_capa_apoyo')
ok(d.synced === 1 && dc().sync_status === 'synced', 'con la migración: el rechazo sube en el reintento')
ok(!!rc && rc.args.p_observaciones === 'Es humedal' && rc.args.p_capa_apoyo_id === capaId && rc.args.p_accion === 'descartada', 'con su motivo y el área')

await (db.familias as any).add({ local_id: 'fp', predio_core_id: 'pp', es_practica: true, zonas_sig: [], zonas_finca: [] })
await (db.decisionesApoyo as any).add({ ...dc(), id: undefined, local_id: 'dc-2', familia_local_id: 'fp', capa_apoyo_id: 'practica-capa-2', sync_status: 'pending' })
llamadas.length = 0
d = await syncPendingDecisionesApoyo()
ok(d.synced === 1 && !llamadas.length, 'en un predio de práctica no sale nada a la red')

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien')
if (fallas) throw new Error('fallas')
