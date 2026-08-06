import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, BarChart2, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2, Pencil, Satellite } from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { EvaluacionRecord, ZonaData } from '../../types/evaluacion'
import { reconciliarZonas } from '../../types/evaluacion'
import type { EncuestaPredialRecord, CultivoRow } from '../../types/encuesta'
import type { RevisionRecord } from '../../types/revision'
import { zonasActivas, zonasVigentes } from '../../lib/geo'
import { buscarDiligenciamientoPropio } from '../../lib/core'
import { ActualizarSigCard } from '../../components/ui/ActualizarSig'

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
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  if (!familia) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <p className="text-sm text-center">Familia no encontrada.</p>
      <button onClick={() => navigate('/')} className="text-[#0d7377] text-sm font-semibold">
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
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate('/')} className="p-1 rounded">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{familia.nombre_predio || 'Familia'}</p>
          <p className="text-xs opacity-60">
            {familia.municipio}{familia.vereda && ` · ${familia.vereda}`}
          </p>
        </div>
        <button
          onClick={() => navigate(`/familia/${familia.local_id}/editar`)}
          className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
          title="Editar datos de la familia"
        >
          <Pencil size={16} />
        </button>
      </header>

      <main className="flex-1 px-4 py-5 space-y-4">

        {/* Resumen de la familia */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-1">
          <p className="text-lg font-bold text-gray-800">{familia.nombre_predio}</p>
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
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">Formularios</p>

        {/* Módulo SIG — mapa, geolocalización y corrección de zonas */}
        <button
          onClick={() => navigate(`/sig/${familia.local_id}`)}
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-center gap-3 active:bg-gray-50"
        >
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <Satellite size={20} className="text-teal-600" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-gray-800">Módulo SIG</p>
            <p className="text-xs text-gray-500 mb-1">
              Mapa satelital · GPS a las zonas · corregir límites
            </p>
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 font-medium">
              {activas.length} zona{activas.length !== 1 ? 's' : ''} de siembra
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
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-center gap-3 active:bg-gray-50 disabled:opacity-60"
        >
          <div className="w-10 h-10 rounded-xl bg-[#0d7377]/10 flex items-center justify-center flex-shrink-0">
            {creating
              ? <Loader2 size={20} className="text-[#0d7377] animate-spin" />
              : <ClipboardList size={20} className="text-[#0d7377]" />}
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-sm font-semibold text-gray-800">Evaluación de Campo</p>
            <p className="text-xs text-gray-500 mb-1">
              {activas.length === 0
                ? 'Sin zonas activas — revisa el módulo SIG'
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
          className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 flex items-center gap-3 active:bg-gray-50 disabled:opacity-60"
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
