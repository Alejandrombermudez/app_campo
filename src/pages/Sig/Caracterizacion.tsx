import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Check, Leaf, Mountain, Route } from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { RevisionRecord } from '../../types/revision'
import type {
  EvaluacionRecord, ZonaData, SeccionCobertura, SeccionSuelo, SeccionLogistica,
} from '../../types/evaluacion'
import { claveSitio, estadoCaracterizacion } from '../../types/evaluacion'
import { zonasVigentes, parseGeom } from '../../lib/geo'
import { abrirEvaluacion } from '../../lib/evaluacion'
import { nombreProyecto } from '../../lib/proyectos'
import { Step03 } from '../Evaluacion/Step03_CoberturaVegetal'
import { Step04 } from '../Evaluacion/Step04_SueloTopografia'
import { Step05 } from '../Evaluacion/Step05_LogisticaAcceso'

/**
 * CARACTERIZACIÓN BIOFÍSICA DE UN SITIO (§3 cobertura, §4 suelo, §5 acceso).
 *
 * Se abre desde el editor SIG, con el sitio a la vista, en vez de llenar
 * «Zona 1, Zona 2…» en el formulario sin saber cuál es cuál (pedido del usuario,
 * 2026-10-21). Guarda en la misma evaluación del predio (EvaluacionRecord.zonas,
 * por zona_id o, si el sitio aún no sincroniza, por el local_id de su revisión),
 * así que sube por el mismo camino de siempre.
 */
type Pestana = 'cobertura' | 'suelo' | 'logistica'
const PESTANAS: { id: Pestana; txt: string; Icono: typeof Leaf }[] = [
  { id: 'cobertura', txt: 'Cobertura', Icono: Leaf },
  { id: 'suelo',     txt: 'Suelo',     Icono: Mountain },
  { id: 'logistica', txt: 'Acceso',    Icono: Route },
]

export function CaracterizacionPage() {
  const { id, clave } = useParams<{ id: string; clave: string }>()   // familia local_id, clave del sitio
  const navigate = useNavigate()
  const volver = () => navigate(`/sig/${id}`)

  const [familia, setFamilia] = useState<FamiliaRecord | null>(null)
  const [revisiones, setRevisiones] = useState<RevisionRecord[]>([])
  const [ev, setEv] = useState<EvaluacionRecord | null>(null)
  const [yaRegistrada, setYaRegistrada] = useState<string | null>(null)
  const [cargado, setCargado] = useState(false)
  const [pestana, setPestana] = useState<Pestana>('cobertura')
  const sucio = useRef(false)

  useEffect(() => {
    if (!id) return
    ;(async () => {
      const [f, revs] = await Promise.all([
        db.familias.where('local_id').equals(id).first(),
        db.revisiones.where('familia_local_id').equals(id).toArray(),
      ])
      setFamilia(f ?? null)
      setRevisiones(revs)
      if (f) {
        const r = await abrirEvaluacion(f, revs)
        if (r.ok) setEv(r.evaluacion)
        else setYaRegistrada(r.yaRegistrada.id)
      }
      setCargado(true)
    })()
  }, [id])

  const sitio = useMemo(
    () => familia ? zonasVigentes(familia, revisiones).find(z => claveSitio(z) === clave) ?? null : null,
    [familia, revisiones, clave],
  )
  const idx = ev ? ev.zonas.findIndex(z => z.zona_id === clave || z.revision_local_id === clave
    || (!!sitio?.zona_id && z.zona_id === sitio.zona_id)) : -1
  const zona: ZonaData | null = ev && idx >= 0 ? ev.zonas[idx] : null

  // Un sitio que se empieza a caracterizar aquí guarda sus fotos con una clave
  // propia (no con su número, que cambia si se agregan o descartan sitios).
  useEffect(() => {
    if (!ev || idx < 0 || ev.zonas[idx].foto_clave) return
    const z = ev.zonas[idx]
    const vacia = !Object.keys(z.cobertura).length && !Object.keys(z.suelo).length && !Object.keys(z.logistica).length
    if (!vacia) return
    cambiarZona({ foto_clave: `sitio_${crypto.randomUUID()}` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ev?.local_id, idx])

  function cambiarZona(cambios: Partial<ZonaData>) {
    sucio.current = true
    setEv(prev => prev && ({
      ...prev,
      zonas: prev.zonas.map((z, i) => i === idx ? { ...z, ...cambios } : z),
      sync_status: 'pending',
      updated_at: new Date().toISOString(),
    }))
  }

  // Guardado continuo (medio segundo después del último cambio) y al salir.
  useEffect(() => {
    if (!ev?.id || !sucio.current) return
    const t = setTimeout(() => { db.evaluaciones.put(ev); sucio.current = false }, 500)
    return () => clearTimeout(t)
  }, [ev])

  async function listo() {
    if (ev?.id && sucio.current) { await db.evaluaciones.put(ev); sucio.current = false }
    volver()
  }

  if (!cargado) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bosque" />
    </div>
  )

  if (yaRegistrada) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-700 px-8 text-center">
      <p className="text-base">Ya registraste una evaluación de este predio desde otro celular con tu nombre. Se puede consultar, pero no se crea otra.</p>
      <button onClick={() => navigate(`/ver/campo/${yaRegistrada}`)} className="boton boton-bosque">Ver la evaluación</button>
      <button onClick={volver} className="boton boton-vidrio">Volver al mapa</button>
    </div>
  )

  if (!familia || !sitio || !ev || !zona) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-700 px-8 text-center">
      <p className="text-base">Este sitio ya no está entre los sitios vigentes del predio (se descartó o el SIG lo cambió).</p>
      <button onClick={volver} className="boton boton-bosque">Volver al mapa</button>
    </div>
  )

  const estado = estadoCaracterizacion(zona)
  const proyecto = nombreProyecto(sitio.revision?.proyecto ?? zona.proyecto)

  return (
    <div className="min-h-screen flex flex-col bg-transparent">
      <header className="cabecera rounded-b-3xl px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4 flex items-center gap-3">
        <button onClick={listo} className="boton-mapa vidrio-oscuro !w-11 !h-11" aria-label="Volver al mapa">
          <ArrowLeft size={20} />
        </button>
        <SiluetaSitio geojson={sitio.geojson} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl leading-tight truncate">Sitio {sitio.zona_numero}{proyecto && ` · ${proyecto}`}</h1>
          <p className="text-xs opacity-80 truncate">
            {familia.nombre_predio}{sitio.area_ha != null && ` · ${sitio.area_ha.toFixed(2)} ha`} · caracterización biofísica
          </p>
        </div>
      </header>

      <div className="px-4 pt-4">
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-full bg-gray-200/80" role="tablist">
          {PESTANAS.map(({ id: p, txt, Icono }) => (
            <button key={p} role="tab" aria-selected={pestana === p} onClick={() => setPestana(p)}
              className={`flex items-center justify-center gap-1.5 min-h-11 rounded-full text-sm font-semibold transition-colors ${pestana === p ? 'boton-bosque' : 'text-gray-700'}`}>
              <Icono size={15} /> {txt}
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto px-4 py-5">
        {pestana === 'cobertura' && (
          <Step03 zona={sitio.zona_numero} data={zona.cobertura}
            onChange={v => cambiarZona({ cobertura: v as Partial<SeccionCobertura> })} />
        )}
        {pestana === 'suelo' && (
          <Step04 zona={sitio.zona_numero} localEvaluacionId={ev.local_id} fotoPrefijo={zona.foto_clave} data={zona.suelo}
            onChange={v => cambiarZona({ suelo: v as Partial<SeccionSuelo> })} />
        )}
        {pestana === 'logistica' && (
          <Step05 zona={sitio.zona_numero} localEvaluacionId={ev.local_id} fotoPrefijo={zona.foto_clave} data={zona.logistica}
            onChange={v => cambiarZona({ logistica: v as Partial<SeccionLogistica> })} />
        )}
      </main>

      <footer className="vidrio !border-x-0 !border-b-0 rounded-t-3xl sticky bottom-0 z-10 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] flex items-center gap-3">
        <p className="flex-1 text-xs text-gray-600">
          {estado === 'completa' ? 'Lo necesario está lleno.' : estado === 'en_curso' ? 'Faltan datos en alguna pestaña.' : 'Se guarda solo mientras llenas.'}
        </p>
        {pestana !== 'logistica' ? (
          <button onClick={() => setPestana(pestana === 'cobertura' ? 'suelo' : 'logistica')} className="boton boton-vidrio">Siguiente</button>
        ) : null}
        <button onClick={listo} className="boton boton-bosque"><Check size={16} /> Listo</button>
      </footer>
    </div>
  )
}

/** La forma del sitio, para saber de cuál se trata sin volver al mapa. */
function SiluetaSitio({ geojson }: { geojson: string | null }) {
  const camino = useMemo(() => {
    const g = parseGeom(geojson ?? '')?.geometry
    if (!g) return null
    const anillos: number[][][] = g.type === 'Polygon' ? [g.coordinates[0] as number[][]]
      : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]).map(p => p[0]) : []
    const puntos = anillos.flat()
    if (!puntos.length) return null
    const xs = puntos.map(p => p[0]), ys = puntos.map(p => p[1])
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const lado = Math.max(x1 - x0, y1 - y0) || 1
    const escala = (v: number, a: number) => 4 + ((v - a) / lado) * 36
    return anillos.map(a => 'M' + a.map(([x, y]) => `${escala(x, x0).toFixed(1)},${(44 - escala(y, y0)).toFixed(1)}`).join('L') + 'Z').join(' ')
  }, [geojson])
  if (!camino) return null
  return (
    <svg viewBox="0 0 44 44" className="w-11 h-11 shrink-0 vidrio-oscuro rounded-xl" aria-hidden>
      <path d={camino} fill="currentColor" fillOpacity={0.25} stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}
