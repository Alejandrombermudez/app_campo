import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ClipboardList, BarChart2, ChevronRight, CheckCircle, Clock, AlertCircle, Loader2, Pencil } from 'lucide-react'
import { db } from '../../db/schema'
import type { FamiliaRecord } from '../../types/familia'
import type { EvaluacionRecord, ZonaData } from '../../types/evaluacion'
import type { EncuestaPredialRecord, CultivoRow } from '../../types/encuesta'

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
  const [loaded,     setLoaded]     = useState(false)
  const [creating,   setCreating]   = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([
      db.familias.where('local_id').equals(id).first(),
      db.evaluaciones.where('familia_local_id').equals(id).first(),
      db.encuestas.where('familia_local_id').equals(id).first(),
    ]).then(([f, e, n]) => {
      setFamilia(f ?? null)
      setCampoEval(e)
      setPredialEnc(n)
      setLoaded(true)
    })
  }, [id])

  // ─── Abrir / crear evaluación de campo ──────────────────────────────────────
  async function openCampo() {
    if (!familia || creating) return
    setCreating(true)
    try {
      const existing = await db.evaluaciones
        .where('familia_local_id').equals(familia.local_id).first()
      if (existing) { navigate(`/evaluacion/${existing.local_id}`); return }

      const numZonas = familia.num_zonas
      const zonas: ZonaData[] = Array.from({ length: numZonas }, (_, i) => ({
        zona_numero: i + 1, cobertura: {}, suelo: {}, logistica: {},
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
        num_zonas:        numZonas,
        seccion_1: {
          codigo_formato:       'AE-CAMPO-001',
          version:              '1.0',
          nombre_predio:        familia.nombre_predio,
          municipio:            familia.municipio,
          vereda:               familia.vereda,
          fecha_visita:         familia.fecha,
          propietario_tenedor:  familia.nombre_propietario,
          contacto_propietario: familia.contacto,
          num_zonas:            numZonas,
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
        nombre_propietario: familia.nombre_propietario,
        municipio:          familia.municipio,
        vereda:             familia.vereda,
        fecha_encuesta:     familia.fecha,
        sec_general: {
          nombre_finca:       familia.nombre_predio,
          municipio:          familia.municipio,
          vereda:             familia.vereda,
          fecha_encuesta:     familia.fecha,
          nombre_propietario: familia.nombre_propietario,
          contacto:           familia.contacto,
          departamento:       familia.departamento,
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
  const totalCampo = evalStepsTotal(familia.num_zonas)

  const campoStatus: FormStatus = !campoEval ? 'pendiente'
    : campoEval.step_completed >= totalCampo - 1 ? 'completo'
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
            {familia.num_zonas} zona{familia.num_zonas > 1 ? 's' : ''} de campo
            {familia.created_by && ` · Creado por ${familia.created_by}`}
          </p>
        </div>

        {/* Formularios hijos */}
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 px-1">Formularios</p>

        {/* Evaluación de Campo */}
        <button
          onClick={openCampo}
          disabled={creating}
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
              AE-CAMPO-001 · {familia.num_zonas} zona{familia.num_zonas > 1 ? 's' : ''}
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
