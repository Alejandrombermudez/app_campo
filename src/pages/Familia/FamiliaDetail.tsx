import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, BarChart2, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2, Pencil, Satellite, RotateCcw } from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { EvaluacionRecord, ZonaData } from '../../types/evaluacion'
import { reconciliarZonas } from '../../types/evaluacion'
import type { EncuestaPredialRecord, CultivoRow } from '../../types/encuesta'
import type { RevisionRecord } from '../../types/revision'
import { zonasActivas, zonasVigentes, limitesVigentes } from '../../lib/geo'
import { buscarDiligenciamientoPropio } from '../../lib/core'
import { ActualizarSigCard } from '../../components/ui/ActualizarSig'
import { reiniciarPractica, tipoPractica } from '../../lib/practica'

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CULTIVOS_BASE = ['Café', 'Cacao', 'Caña de azúcar', 'Plátano', 'Yuca', 'Frutales', 'Madera']

function evalStepsTotal(numZonas: number) {
  // identificacion + cartografia + 3×zonas + riesgos + firmas
  return 4 + 3 * Math.max(1, numZonas)
}
const ENC_STEPS_TOTAL = 8

type FormStatus = 'pendiente' | 'en_curso' | 'completo'

function StatusBadge({ status }: { status: FormStatus }) {
  if (status === 'completo') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
      <CheckCircle size={11} /> Completo
    </span>
  )
  if (status === 'en_curso') return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
      <Clock size={11} /> En curso
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
      <AlertCircle size={11} /> Pendiente
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────
export function FamiliaDetail() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [familia,    setFamilia]    = useState<FamiliaRecord | null>(null)
  const [campoEval,  setCampoEval]  = useState<EvaluacionRecord | undefined>(undefined)
  const [predialEnc, setPredialEnc] = useState<EncuestaPredialRecord | undefined>(undefined)
  const [revisiones, setRevisiones] = useState<RevisionRecord[]>([])
  const [loaded,     setLoaded]     = useState(false)
  const [creating,   setCreating]   = useState(false)

  const cargar = useCallback(async () => {
    if (!id) return
    const [f, e, n, r] = await Promise.all([
      db.familias.where('local_id').equals(id).first(),
      db.evaluaciones.where('familia_local_id').equals(id).first(),
      db.encuestas.where('familia_local_id').equals(id).first(),
      db.revisiones.where('familia_local_id').equals(id).toArray(),
    ])
    setFamilia(f ?? null)
    setPredialEnc(n)
    setRevisiones(r)

    // El número de zonas de la evaluación ya no queda fijo al abrirla: se
    // recalcula contra el estado vigente del SIG cada vez que se vuelve a
    // esta pantalla (p.ej. después de corregir/descartar zonas en el
    // módulo SIG, o de actualizar el predio desde el SIG). Conserva datos ya
    // capturados aunque una zona se descarte o el SIG la retire.
    if (f && e) {
      const vigentes = zonasVigentes(f, r)
      const zonasReconciliadas = reconciliarZonas(e.zonas, vigentes)
      if (JSON.stringify(zonasReconciliadas) !== JSON.stringify(e.zonas)) {
        const actualizado: EvaluacionRecord = {
          ...e,
          zonas: zonasReconciliadas,
          num_zonas: zonasReconciliadas.length,
          updated_at: new Date().toISOString(),
        }
        await db.evaluaciones.put(actualizado)
        setCampoEval(actualizado)
      } else {
        setCampoEval(e)
      }
    } else {
      setCampoEval(e)
    }

    setLoaded(true)
  }, [id])

  useEffect(() => { cargar() }, [cargar])

  // Zonas que se evaluarán en terreno: las del SIG + correcciones locales
  // (módulo SIG), sin las descartadas.
  const activas = familia ? zonasActivas(familia, revisiones) : []
  const nLimites = familia ? limitesVigentes(familia, revisiones).length : 0
  const campoPrimero = familia?.flujo_campo === 'campo_primero'

  // Predio de práctica: borrar lo hecho y dejarlo como nuevo, para la siguiente persona.
  async function empezarDeNuevo() {
    if (!familia?.es_practica) return
    if (!window.confirm('Se borra todo lo que se hizo en este predio de práctica (sitios, límite, evaluación y encuesta) y queda como nuevo. ¿Empezar de nuevo?')) return
    const nuevo = await reiniciarPractica(familia)
    navigate(`/familia/${nuevo}`, { replace: true })
  }

  // ─── Abrir / crear evaluación de campo ──────────────────────────────────────
  // SIG I es obligatorio: las zonas NO se inventan, son las que el SIG ya
  // dibujó (geo.zonas), con las correcciones que campo haya hecho encima.
  // Si por algún motivo la familia quedó sin zonas activas, se bloquea.
  async function openCampo() {
    if (!familia || creating || activas.length === 0) return
    setCreating(true)
    try {
      const existing = await db.evaluaciones
        .where('familia_local_id').equals(familia.local_id).first()
      if (existing) { navigate(`/evaluacion/${existing.local_id}`); return }

      // La misma persona no puede diligenciar dos veces el mismo predio, aunque
      // no quede rastro local (otro dispositivo, reinstalación, etc.) — se
      // verifica contra lo ya sincronizado en Supabase.
      if (familia.predio_core_id && !familia.es_practica) {
        const userName = localStorage.getItem('ae_campo_user') ?? ''
        const propio = await buscarDiligenciamientoPropio('evaluaciones_campo', familia.predio_core_id, userName)
        if (propio) {
          alert(`Ya registraste una Evaluación de Campo para "${familia.nombre_predio}" con el nombre "${userName}". No se puede crear otra — la puedes consultar en la pestaña "Todos".`)
          navigate(`/ver/campo/${propio.id}`)
          return
        }
      }

      const zonas: ZonaData[] = activas.map((z, i) => ({
        zona_id: z.zona_id, zona_numero: i + 1, area_ha_sig: z.area_ha,
        cobertura: {}, suelo: {}, logistica: {},
      }))

      const newEval: EvaluacionRecord = {
        local_id:         crypto.randomUUID(),
        familia_local_id: familia.local_id,
        supabase_id:      null,
        sync_status:      'pending',
        sync_error:       null,
        created_at:       new Date().toISOString(),
        updated_at:       new Date().toISOString(),
        step_completed:   0,
        created_by:       localStorage.getItem('ae_campo_user') ?? '',
        nombre_predio:    familia.nombre_predio,
        codigo_predio:    '',
        municipio:        familia.municipio,
        fecha_visita:     familia.fecha,
        num_zonas:        zonas.length,
        seccion_1: {
          codigo_formato: 'AE-CAMPO-001',
          version:        '1.0',
          fecha_visita:   familia.fecha,
        },
        seccion_2: {},
        zonas,
        seccion_6: {},
        seccion_7: {},
      }

      await db.evaluaciones.add(newEval)
      navigate(`/evaluacion/${newEval.local_id}`)
    } finally {
      setCreating(false)
    }
  }

  // ─── Abrir / crear encuesta predial ─────────────────────────────────────────
  async function openPredial() {
    if (!familia || creating) return
    setCreating(true)
    try {
      const existing = await db.encuestas
        .where('familia_local_id').equals(familia.local_id).first()
      if (existing) { navigate(`/encuesta/${existing.local_id}`); return }

      if (familia.predio_core_id && !familia.es_practica) {
        const userName = localStorage.getItem('ae_campo_user') ?? ''
        const propio = await buscarDiligenciamientoPropio('familias', familia.predio_core_id, userName)
        if (propio) {
          alert(`Ya registraste una Encuesta Predial para "${familia.nombre_predio}" con el nombre "${userName}". No se puede crear otra — la puedes consultar en la pestaña "Todos".`)
          navigate(`/ver/predial/${propio.id}`)
          return
        }
      }

      const newEnc: EncuestaPredialRecord = {
        local_id:           crypto.randomUUID(),
        familia_local_id:   familia.local_id,
        supabase_id:        null,
        sync_status:        'pending',
        sync_error:         null,
        created_at:         new Date().toISOString(),
        updated_at:         new Date().toISOString(),
        step_completed:     0,
        created_by:         localStorage.getItem('ae_campo_user') ?? '',
        // Snapshot para listado — identidad real ya vive en familia (core), esto
        // solo evita una consulta extra al armar las tarjetas de Home.
        nombre_propietario: familia.nombre_propietario,
        municipio:          familia.municipio,
        vereda:             familia.vereda,
        fecha_encuesta:     familia.fecha,
        sec_general: {
          fecha_encuesta: familia.fecha,
        },
        sec_vivienda:  {},
        sec_familia:   {},
        sec_economia:  {},
        sec_cultivos:  CULTIVOS_BASE.map(c => ({
          cultivo: c, area_ha: '', anio_siembra: '', densidad: '', rendimiento: '', destino: '',
        } as CultivoRow)),
        sec_ganaderia:  {},
        sec_tecnologia: {},
        sec_bosque:     {},
      }

      await db.encuestas.add(newEnc)
      navigate(`/encuesta/${newEnc.local_id}`)
    } finally {
      setCreating(false)
    }
  }

  // ─── Loading / not found ─────────────────────────────────────────────────────
  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-bosque" />
    </div>
  )

  if (!familia) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <p className="text-sm text-center">Familia no encontrada.</p>
      <button onClick={() => navigate('/')} className="text-bosque text-sm font-semibold">
        Ir al inicio
      </button>
    </div>
  )

  // ─── Estado de cada formulario ───────────────────────────────────────────────
  // El total de pasos sigue el número real de zonas de la evaluación (ya
  // reconciliado contra el SIG), no familia.num_zonas — ese es un snapshot
  // congelado de cuando se creó la familia, no se actualiza con el tiempo.
  const campoStatus: FormStatus = !campoEval ? 'pendiente'
    : campoEval.step_completed >= evalStepsTotal(campoEval.zonas.length) - 1 ? 'completo'
    : 'en_curso'

  const predialStatus: FormStatus = !predialEnc ? 'pendiente'
    : predialEnc.step_completed >= ENC_STEPS_TOTAL - 1 ? 'completo'
    : 'en_curso'

  return (
    <div className="min-h-screen flex flex-col bg-transparent">

      {/* Header */}
      <header className="cabecera rounded-b-3xl px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-4 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="boton-mapa vidrio-oscuro !w-11 !h-11" aria-label="Volver">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl leading-tight truncate">{familia.nombre_predio || 'Predio'}</h1>
          <p className="text-xs opacity-80">
            {familia.municipio}{familia.vereda && ` · ${familia.vereda}`}
          </p>
        </div>
        <button
          onClick={() => navigate(`/familia/${familia.local_id}/editar`)}
          className="boton-mapa vidrio-oscuro !w-11 !h-11"
          title="Ver la ficha del predio" aria-label="Ver la ficha del predio"
        >
          <Pencil size={18} />
        </button>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4">

        {familia.es_practica && (
          <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3 text-[13px] text-purple-900">
            <p>
              <strong>Predio de práctica.</strong>{' '}
              {tipoPractica(familia) === 'campo_primero'
                ? 'Aquí se ensaya «campo primero»: dibujar el límite del predio y los sitios de siembra, con la capa de apoyo como guía.'
                : 'Aquí se ensaya verificar la propuesta del SIG: confirmar, corregir o descartar cada sitio y revisar el límite.'}
              {' '}Nada de lo que se haga aquí se sube: se queda en este celular.
            </p>
            <button onClick={empezarDeNuevo} className="boton boton-vidrio !min-h-10 !px-3.5 !text-sm mt-2.5">
              <RotateCcw size={15} /> Empezar de nuevo
            </button>
          </div>
        )}

        {/* Resumen de la familia */}
        <div className="tarjeta px-4 py-4 space-y-1">
          {campoPrimero && (
            <p className="text-[13px] text-amber-900 bg-amber-100 border border-amber-200 rounded-2xl px-3 py-2 mb-2">
              <strong>Campo primero:</strong> en esta visita se delimita el predio y se dibujan los sitios de siembra (Módulo SIG).
              Después, la evaluación de esos sitios y la encuesta, como siempre.
            </p>
          )}
          <h2 className="text-xl text-gray-900">{familia.nombre_predio}</h2>
          <p className="text-sm text-gray-600">{familia.nombre_propietario}</p>
          <p className="text-xs text-gray-400">
            {familia.municipio}{familia.vereda && ` · ${familia.vereda}`}
            {familia.fecha && ` · ${new Date(familia.fecha + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <p className="text-xs text-gray-400">
            {activas.length} zona{activas.length !== 1 ? 's' : ''} de campo vigente{activas.length !== 1 ? 's' : ''}
            {familia.created_by && ` · Creado por ${familia.created_by}`}
          </p>
        </div>

        {/* Traer del SIG el límite del predio y las zonas como están hoy */}
        <ActualizarSigCard familia={familia} onActualizado={cargar} />

        {/* Formularios hijos */}
        <p className="rotulo px-1">En esta visita</p>

        {/* Módulo SIG — mapa, geolocalización y corrección de zonas */}
        <button
          onClick={() => navigate(`/sig/${familia.local_id}`)}
          className="tarjeta w-full px-4 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Satellite size={20} className="text-teal-600" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-gray-800">Módulo SIG</p>
            <p className="text-xs text-gray-500 mb-1">
              {campoPrimero
                ? 'Delimitar el predio y dibujar los sitios de siembra'
                : 'Mapa satelital · GPS a las zonas · corregir límites'}
            </p>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">
              {nLimites ? 'Con límite' : 'Sin límite'} · {activas.length} zona{activas.length !== 1 ? 's' : ''} de siembra
              {revisiones.filter(r => r.sync_status !== 'synced').length > 0 &&
                ` · ${revisiones.filter(r => r.sync_status !== 'synced').length} cambio(s) por sincronizar`}
            </span>
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>

        {/* Evaluación de Campo */}
        <button
          onClick={openCampo}
          disabled={creating || activas.length === 0}
          className="tarjeta w-full px-4 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-bosque/10 flex items-center justify-center flex-shrink-0">
            {creating
              ? <Loader2 size={20} className="text-bosque animate-spin" />
              : <ClipboardList size={20} className="text-bosque" />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-gray-800">Evaluación de Campo</p>
            <p className="text-xs text-gray-500 mb-1">
              {activas.length === 0
                ? (campoPrimero ? 'Primero dibuja los sitios de siembra en el Módulo SIG' : 'Sin zonas activas — revisa el módulo SIG')
                : `AE-CAMPO-001 · ${activas.length} zona${activas.length > 1 ? 's' : ''}`}
            </p>
            <StatusBadge status={campoStatus} />
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>

        {/* Encuesta Predial */}
        <button
          onClick={openPredial}
          disabled={creating}
          className="tarjeta w-full px-4 py-4 flex items-center gap-3 active:scale-[0.99] transition-transform disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            {creating
              ? <Loader2 size={20} className="text-emerald-600 animate-spin" />
              : <BarChart2 size={20} className="text-emerald-600" />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-gray-800">Encuesta Predial</p>
            <p className="text-xs text-gray-500 mb-1">Caracterización · 8 secciones</p>
            <StatusBadge status={predialStatus} />
          </div>
          <ChevronRight size={18} className="text-gray-300 flex-shrink-0" />
        </button>

      </main>
    </div>
  )
}
