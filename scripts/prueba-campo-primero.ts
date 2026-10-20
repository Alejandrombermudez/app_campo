// Prueba de la lógica pura del flujo «campo primero» (sin red, sin Dexie).
// Correr:  npx rolldown scripts/prueba-campo-primero.ts --format esm --platform node -o <salida>.mjs && node <salida>.mjs
// Cubre lo que no se puede romper: el límite dibujado en campo no se mezcla con
// los sitios, y una geometría hecha en terreno no se pierde por un «Confirmar».
import { zonasVigentes, limitesVigentes, zonasActivas } from '../src/lib/geo'
import { fusionarRevision, tipoRevision, type RevisionRecord } from '../src/types/revision'
import type { FamiliaRecord } from '../src/types/familia'

let fallas = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? 'OK   ' : 'FALLA'} ${m}`); if (!c) fallas++ }

const poly = (d: number) => JSON.stringify({ type: 'Polygon', coordinates: [[[-75.6, 1.6], [-75.6 + d, 1.6], [-75.6 + d, 1.6 + d], [-75.6, 1.6]]] })
let t = 0
const rev = (p: Partial<RevisionRecord>): RevisionRecord => ({
  id: ++t, local_id: `l${t}`, familia_local_id: 'f', predio_core_id: 'p', zona_id: null, accion: 'nueva', metodo: 'nueva',
  geojson: poly(0.001), area_ha: 1, observaciones: '', zona_numero: 0, sync_status: 'pending', sync_error: null,
  created_by: 'x', fecha: '2026-10-20', created_at: `2026-10-20T10:00:0${t}Z`, updated_at: `2026-10-20T10:00:0${t}Z`, ...p,
})
function familia(p: Partial<FamiliaRecord> = {}): FamiliaRecord {
  return {
  local_id: 'f', sync_status: 'synced', sync_error: null, supabase_id: null, created_at: '', updated_at: '', created_by: '',
  predio_core_id: 'p', expediente_id: 'e', nombre_predio: 'x', nombre_propietario: 'x', municipio: 'x', vereda: 'x',
  departamento: 'x', contacto: '', zonas_sig: [], zonas_finca: [], num_zonas: 0, fecha: '2026-10-20', ...p,
  }
}

// 1. Campo primero: sin nada del SIG, se dibujan un límite y un sitio
{
  const f = familia({ flujo_campo: 'campo_primero' })
  const revs = [rev({ tipo: 'finca', metodo: 'gps' }), rev({ tipo: 'restauracion' })]
  const zs = zonasVigentes(f, revs)
  const ls = limitesVigentes(f, revs)
  ok(zs.length === 1 && zs[0].revision?.tipo === 'restauracion', 'el sitio dibujado sale como zona; el límite no')
  ok(ls.length === 1 && ls[0].zona_id === null && ls[0].origen === 'campo', 'el límite dibujado sale como límite de campo, sin id todavía')
  ok(zonasActivas(f, revs).length === 1, 'la evaluación recorre solo el sitio, no el límite')
}

// 2. Revisiones viejas (sin campo tipo) siguen siendo de sitios
{
  const r = rev({}); delete (r as Partial<RevisionRecord>).tipo
  ok(tipoRevision(r) === 'restauracion', 'una revisión anterior al cambio se lee como sitio de siembra')
  ok(limitesVigentes(familia(), [r]).length === 0, 'y no aparece como límite')
}

// 3. Un límite del SIG corregido en campo y ya sincronizado no sale como sitio «retirado»
{
  const f = familia({
    zonas_sig: [{ zona_id: 'z1', nombre: null, tipo: 'restauracion', estado: 'potencial', area_ha: 1, perimetro_m: 1, geojson: poly(0.001) }],
    zonas_finca: [{ zona_id: 'L1', area_ha: 30, geojson: poly(0.01) }],
  })
  const revs = [rev({ tipo: 'finca', zona_id: 'L1', accion: 'modificada', geojson: poly(0.012), sync_status: 'synced' })]
  const zs = zonasVigentes(f, revs)
  ok(zs.length === 1 && !zs.some(z => z.retirada_del_sig), 'la revisión del límite no fabrica un sitio retirado')
  const ls = limitesVigentes(f, revs)
  ok(ls.length === 1 && ls[0].geojson === poly(0.012) && ls[0].origen === 'campo', 'el límite muestra la geometría de campo')
}

// 4. Confirmar un límite ya corregido NO lo devuelve a la forma del SIG (el bug del 2026-08-06, ahora para el límite)
{
  const previa = rev({ tipo: 'finca', zona_id: 'L1', accion: 'modificada', metodo: 'vertices', geojson: poly(0.02) })
  const r = fusionarRevision(previa, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null })
  ok(r.accion === 'modificada' && r.geojson === poly(0.02), 'confirmar después de corregir conserva la corrección')
  const nueva = rev({ tipo: 'finca', metodo: 'gps', geojson: poly(0.03) })
  const r2 = fusionarRevision(nueva, { accion: 'confirmada', metodo: null, geojson: null, area_ha: null })
  ok(r2.accion === 'nueva' && r2.geojson === poly(0.03) && r2.metodo === 'gps', 'confirmar un límite trazado con GPS lo deja como nuevo, con su trazo')
}

// 5. Varias correcciones del mismo límite: manda la última
{
  const f = familia({ zonas_finca: [{ zona_id: 'L1', area_ha: 30, geojson: poly(0.01) }] })
  const revs = [
    rev({ tipo: 'finca', zona_id: 'L1', accion: 'modificada', geojson: poly(0.011), sync_status: 'synced', updated_at: '2026-10-20T09:00:00Z' }),
    rev({ tipo: 'finca', zona_id: 'L1', accion: 'modificada', geojson: poly(0.013), updated_at: '2026-10-20T11:00:00Z' }),
  ]
  ok(limitesVigentes(f, revs)[0].geojson === poly(0.013), 'el límite muestra la corrección más reciente')
}

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo bien')
if (fallas) throw new Error('fallas')
