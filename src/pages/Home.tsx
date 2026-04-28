import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, RefreshCw, Wifi, WifiOff, Trash2, ChevronRight,
  Copy, ChevronDown, ChevronUp, User, Globe, BarChart2,
  CheckCircle, Clock, AlertCircle, Loader2, Download,
} from 'lucide-react'
import { db } from '../db/schema'
import type { FamiliaRecord } from '../types/familia'
import type { EvaluacionRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'
import type { PredioRecord } from '../types/predio'
import {
  syncPendingFamilias,
  syncPendingEvaluaciones,
  syncPendingEncuestas,
  syncPendingPredios,
} from '../lib/sync'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { supabase, evalTable, encTable } from '../lib/supabase'
import { InstallBanner } from '../components/ui/InstallBanner'
import { UserSetup } from '../components/ui/UserSetup'
import { StatsTab } from './Stats'

// ─── Tipos remotos ─────────────────────────────────────────────────────────────
interface RemotePredio {
  id: string; local_id: string | null
  nombre_predio: string | null; nombre_propietario: string | null
  municipio: string | null; vereda: string | null
  fecha: string | null; num_zonas: number | null
  created_by: string | null; created_at: string
}
interface RemoteEval {
  id: string; local_id: string | null; nombre_predio: string | null
  fecha_visita: string | null; num_zonas_eval: number | null
  created_by: string | null; seccion_1_data: { municipio?: string } | null
  sync_origin: string | null; created_at: string
}
interface RemoteEnc {
  id: string; local_id: string | null; nombre_propietario: string | null
  municipio: string | null; vereda: string | null
  fecha_encuesta: string | null; created_by: string | null; created_at: string
}

// ─── Estado sync ───────────────────────────────────────────────────────────────
const STATUS: Record<'pending'|'synced'|'error', { label: string; color: string }> = {
  pending: { label: 'Pendiente',    color: 'bg-amber-100 text-amber-700' },
  synced:  { label: 'Sincronizado', color: 'bg-emerald-100 text-emerald-700' },
  error:   { label: '⚠ Error',      color: 'bg-red-100 text-red-700' },
}

// ─── Panel de error expandible ─────────────────────────────────────────────────
function ErrorPanel({ msg }: { msg: string }) {
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(msg).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }
  return (
    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 overflow-hidden text-xs">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-red-700 font-medium">
        <span>Detalle del error</span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-red-600 break-all font-mono leading-relaxed">{msg}</p>
          <button onClick={copy} className="flex items-center gap-1 text-red-500 underline">
            <Copy size={11} /> {copied ? '¡Copiado!' : 'Copiar error'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Pills de estado formulario ────────────────────────────────────────────────
type FormStatus = 'pendiente' | 'en_curso' | 'completo'

function FormPill({ label, status }: { label: string; status: FormStatus }) {
  if (status === 'completo') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
      <CheckCircle size={9}/> {label} ✓
    </span>
  )
  if (status === 'en_curso') return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
      <Clock size={9}/> {label}…
    </span>
  )
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
      <AlertCircle size={9}/> {label}
    </span>
  )
}

function evalStepsTotal(numZonas: number) { return 4 + 3 * Math.max(1, numZonas) }
const ENC_STEPS = 8

// ─── Tarjeta Familia (local) ────────────────────────────────────────────────────
function LocalFamiliaCard({
  familia, campoEval, predialEnc, onDelete,
}: {
  familia: FamiliaRecord
  campoEval?: EvaluacionRecord
  predialEnc?: EncuestaPredialRecord
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const st       = STATUS[familia.sync_status]

  const campoStatus: FormStatus = !campoEval ? 'pendiente'
    : campoEval.step_completed >= evalStepsTotal(familia.num_zonas) - 1 ? 'completo' : 'en_curso'
  const predialStatus: FormStatus = !predialEnc ? 'pendiente'
    : predialEnc.step_completed >= ENC_STEPS - 1 ? 'completo' : 'en_curso'

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${familia.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3"
        onClick={() => navigate(`/familia/${familia.local_id}`)}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">{familia.nombre_predio || '(Sin nombre)'}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {familia.nombre_propietario}
            {familia.municipio && ` · ${familia.municipio}`}
            {familia.vereda && ` · ${familia.vereda}`}
            {familia.fecha && ` · ${new Date(familia.fecha + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <FormPill label="Campo"   status={campoStatus} />
            <FormPill label="Predial" status={predialStatus} />
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          </div>
          {familia.sync_status === 'error' && familia.sync_error && <ErrorPanel msg={familia.sync_error} />}
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(familia.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta predio unificado legacy ──────────────────────────────────────────
function LocalPredioCard({ predio, onDelete }: { predio: PredioRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[predio.sync_status]
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden opacity-80 ${predio.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-3 pb-2 flex items-start gap-3"
        onClick={() => navigate(`/predio/${predio.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">UNIFICADO</span>
            <p className="text-sm font-medium text-gray-700 truncate">{predio.nombre_predio || '(Sin nombre)'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          </div>
          {predio.sync_status === 'error' && predio.sync_error && <ErrorPanel msg={predio.sync_error} />}
        </div>
        <ChevronRight size={16} className="text-gray-200 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-1.5 flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={11} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta evaluación legacy ─────────────────────────────────────────────────
function LocalEvalCard({ ev, onDelete }: { ev: EvaluacionRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[ev.sync_status]
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden opacity-75 ${ev.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-3 pb-2 flex items-start gap-3"
        onClick={() => navigate(`/evaluacion/${ev.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">CAMPO legacy</span>
            <p className="text-sm font-medium text-gray-700 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          {ev.sync_status === 'error' && ev.sync_error && <ErrorPanel msg={ev.sync_error} />}
        </div>
        <ChevronRight size={16} className="text-gray-200 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-1.5 flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={11} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta encuesta legacy ───────────────────────────────────────────────────
function LocalEncCard({ enc, onDelete }: { enc: EncuestaPredialRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[enc.sync_status]
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden opacity-75 ${enc.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-3 pb-2 flex items-start gap-3"
        onClick={() => navigate(`/encuesta/${enc.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">PREDIAL legacy</span>
            <p className="text-sm font-medium text-gray-700 truncate">{enc.nombre_propietario || '(Sin nombre)'}</p>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          {enc.sync_status === 'error' && enc.sync_error && <ErrorPanel msg={enc.sync_error} />}
        </div>
        <ChevronRight size={16} className="text-gray-200 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-1.5 flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={11} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjetas remotas ──────────────────────────────────────────────────────────
function RemotePredioCard({ predio, onOpen }: { predio: RemotePredio; onOpen: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true)
    try { await onOpen() } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading}
      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 active:bg-gray-50 disabled:opacity-60">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">{predio.nombre_predio || '(Sin nombre)'}</p>
          <p className="text-sm text-gray-600 truncate">{predio.nombre_propietario}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {predio.municipio || '—'}{predio.vereda && ` · ${predio.vereda}`}
            {predio.fecha && ` · ${new Date(predio.fecha + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {predio.created_by && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <User size={10}/>{predio.created_by}
              </span>
            )}
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Nube</span>
          </div>
        </div>
        {loading
          ? <Loader2 size={16} className="text-[#0d7377] animate-spin flex-shrink-0 mt-1"/>
          : <Download size={16} className="text-gray-300 flex-shrink-0 mt-1"/>}
      </div>
    </button>
  )
}

function RemoteEvalCard({ ev, onOpen }: { ev: RemoteEval; onOpen: () => Promise<void> }) {
  const municipio = ev.seccion_1_data?.municipio ?? '—'
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true)
    try { await onOpen() } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading}
      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 active:bg-gray-50 disabled:opacity-60">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377] flex-shrink-0">CAMPO</span>
          <p className="font-semibold text-gray-800 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
        </div>
        {loading
          ? <Loader2 size={16} className="text-[#0d7377] animate-spin flex-shrink-0"/>
          : <Download size={16} className="text-gray-300 flex-shrink-0"/>}
      </div>
      <p className="text-xs text-gray-500 truncate">
        {municipio}{ev.fecha_visita && ` · ${new Date(ev.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {ev.created_by && (
          <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            <User size={10}/>{ev.created_by}
          </span>
        )}
        <span className="text-xs bg-[#0d7377]/10 text-[#0d7377] px-2 py-0.5 rounded-full text-xs">☁ Importar</span>
      </div>
    </button>
  )
}

function RemoteEncCard({ enc, onOpen }: { enc: RemoteEnc; onOpen: () => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  async function handle() {
    setLoading(true)
    try { await onOpen() } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  return (
    <button onClick={handle} disabled={loading}
      className="w-full text-left bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 active:bg-gray-50 disabled:opacity-60">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">PREDIAL</span>
          <p className="font-semibold text-gray-800 truncate">{enc.nombre_propietario || '(Sin nombre)'}</p>
        </div>
        {loading
          ? <Loader2 size={16} className="text-emerald-600 animate-spin flex-shrink-0"/>
          : <Download size={16} className="text-gray-300 flex-shrink-0"/>}
      </div>
      <p className="text-xs text-gray-500 truncate">
        {enc.municipio || '—'}{enc.vereda && ` · ${enc.vereda}`}
      </p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {enc.created_by && (
          <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
            <User size={10}/>{enc.created_by}
          </span>
        )}
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Importar</span>
      </div>
    </button>
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate()
  const online   = useOnlineStatus()

  const [tab, setTab]               = useState<'mios' | 'todos' | 'stats'>('mios')
  const [familias,  setFamilias]    = useState<FamiliaRecord[]>([])
  const [predios,   setPredios]     = useState<PredioRecord[]>([])
  const [evals,     setEvals]       = useState<EvaluacionRecord[]>([])
  const [encs,      setEncs]        = useState<EncuestaPredialRecord[]>([])
  const [remotePredios, setRemotePredios] = useState<RemotePredio[]>([])
  const [remoteEvals,   setRemoteEvals]   = useState<RemoteEval[]>([])
  const [remoteEncs,    setRemoteEncs]    = useState<RemoteEnc[]>([])
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [toast, setToast]           = useState<{ msg: string; isError: boolean } | null>(null)
  const [userName, setUserName]     = useState<string | null>(
    () => localStorage.getItem('ae_campo_user')
  )

  // ─── Cargar datos locales ────────────────────────────────────────────────────
  const loadLocal = useCallback(async () => {
    const [f, p, e, n] = await Promise.all([
      db.familias.orderBy('updated_at').reverse().toArray(),
      db.predios.orderBy('updated_at').reverse().toArray(),
      db.evaluaciones.orderBy('updated_at').reverse().toArray(),
      db.encuestas.orderBy('updated_at').reverse().toArray(),
    ])
    setFamilias(f as FamiliaRecord[])
    setPredios(p as PredioRecord[])
    setEvals(e as EvaluacionRecord[])
    setEncs(n as EncuestaPredialRecord[])
  }, [])

  useEffect(() => { loadLocal() }, [loadLocal])

  // ─── Cargar datos remotos ────────────────────────────────────────────────────
  const loadRemote = useCallback(async () => {
    if (!online) return
    setLoadingRemote(true)
    try {
      // Intentar nueva tabla siembra.predios (padre de familias)
      const { data: prediosData } = await supabase.schema('siembra').from('predios')
        .select('id, local_id, nombre_predio, nombre_propietario, municipio, vereda, fecha, num_zonas, created_by, created_at')
        .order('created_at', { ascending: false }).limit(50)

      if (prediosData && prediosData.length > 0) {
        setRemotePredios(prediosData as RemotePredio[])
      } else {
        setRemotePredios([])
      }

      // Siempre cargar las tablas legacy para registros anteriores
      const [{ data: de }, { data: dn }] = await Promise.all([
        supabase.schema('siembra').from('evaluaciones_campo')
          .select('id, local_id, nombre_predio, fecha_visita, num_zonas_eval, created_by, seccion_1_data, sync_origin, created_at')
          .order('created_at', { ascending: false }).limit(50),
        supabase.schema('siembra').from('familias')
          .select('id, local_id, nombre_propietario, municipio, vereda, fecha_encuesta, created_by, created_at')
          .order('created_at', { ascending: false }).limit(50),
      ])
      if (de) setRemoteEvals(de as RemoteEval[])
      if (dn) setRemoteEncs(dn as RemoteEnc[])
    } finally {
      setLoadingRemote(false)
    }
  }, [online])

  useEffect(() => { if (tab === 'todos') loadRemote() }, [tab, loadRemote])

  // ─── Sync ────────────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!online) return
    setSyncing(true)
    try {
      // Familias primero, luego hijos
      const rf = await syncPendingFamilias()
      const [rp, re, rn] = await Promise.all([
        syncPendingPredios(),
        syncPendingEvaluaciones(),
        syncPendingEncuestas(),
      ])
      await loadLocal()
      const synced = rf.synced + rp.synced + re.synced + rn.synced
      const errors = rf.errors + rp.errors + re.errors + rn.errors
      if (errors > 0) {
        setToast({ msg: `${synced} sincronizados, ${errors} con error — ver detalle abajo`, isError: true })
      } else {
        setToast({ msg: `✓ ${synced} registro(s) sincronizado(s)`, isError: false })
        if (tab === 'todos') loadRemote()
      }
    } finally {
      setSyncing(false)
      setTimeout(() => setToast(null), 6000)
    }
  }

  // ─── Borrar ──────────────────────────────────────────────────────────────────
  async function handleDeleteFamilia(f: FamiliaRecord) {
    if (!window.confirm(`¿Eliminar la familia "${f.nombre_predio || 'sin nombre'}"?\nSe eliminarán también los formularios asociados.`)) return
    // Borrar formularios hijos
    const linkedEvals = await db.evaluaciones.where('familia_local_id').equals(f.local_id).toArray()
    const linkedEncs  = await db.encuestas.where('familia_local_id').equals(f.local_id).toArray()
    for (const e of linkedEvals) {
      await db.photos.where('local_evaluacion_id').equals(e.local_id).delete()
      await db.evaluaciones.delete(e.id!)
    }
    for (const n of linkedEncs) await db.encuestas.delete(n.id!)
    await db.familias.delete(f.id!)
    await loadLocal()
  }

  async function handleDeletePredio(p: PredioRecord) {
    if (!window.confirm(`¿Eliminar "${p.nombre_predio || 'sin nombre'}"?`)) return
    await db.predios.delete(p.id!)
    await db.photos.where('local_evaluacion_id').equals(p.local_id).delete()
    await loadLocal()
  }

  async function handleDeleteEval(ev: EvaluacionRecord) {
    if (!window.confirm(`¿Eliminar "${ev.nombre_predio || 'sin nombre'}"?`)) return
    await db.evaluaciones.delete(ev.id!)
    await db.photos.where('local_evaluacion_id').equals(ev.local_id).delete()
    await loadLocal()
  }

  async function handleDeleteEnc(enc: EncuestaPredialRecord) {
    if (!window.confirm(`¿Eliminar encuesta de "${enc.nombre_propietario || 'sin nombre'}"?`)) return
    await db.encuestas.delete(enc.id!)
    await loadLocal()
  }

  // ─── Importar registro remoto (campo) y abrir localmente ────────────────────
  async function handleOpenRemoteEval(remoteId: string) {
    // ¿Ya existe local?
    const existing = await db.evaluaciones.where('supabase_id').equals(remoteId).first()
    if (existing) { navigate(`/evaluacion/${existing.local_id}`); return }

    // Descargar registro completo
    const { data, error } = await evalTable().select('*').eq('id', remoteId).single()
    if (error || !data) throw new Error('No se pudo importar el registro de campo')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const newEval: EvaluacionRecord = {
      local_id:         crypto.randomUUID(),
      supabase_id:      remoteId,
      familia_local_id: undefined,
      sync_status:      'synced',
      sync_error:       null,
      created_at:       d.created_at,
      updated_at:       d.updated_at ?? d.created_at,
      step_completed:   d.step_completed ?? 0,
      created_by:       d.created_by ?? '',
      nombre_predio:    d.nombre_predio ?? '',
      codigo_predio:    d.seccion_1_data?.codigo_predio ?? '',
      municipio:        d.seccion_1_data?.municipio ?? '',
      fecha_visita:     d.fecha_visita ?? '',
      num_zonas:        d.num_zonas_eval ?? 1,
      seccion_1:        d.seccion_1_data ?? {},
      seccion_2:        d.seccion_2_data ?? {},
      zonas:            d.zonas_data ?? [],
      seccion_6:        d.seccion_6_data ?? {},
      seccion_7:        {},
    }
    await db.evaluaciones.add(newEval)
    await loadLocal()
    navigate(`/evaluacion/${newEval.local_id}`)
  }

  // ─── Importar registro remoto (predial) y abrir localmente ──────────────────
  async function handleOpenRemoteEnc(remoteId: string) {
    const existing = await db.encuestas.where('supabase_id').equals(remoteId).first()
    if (existing) { navigate(`/encuesta/${existing.local_id}`); return }

    const { data, error } = await encTable().select('*').eq('id', remoteId).single()
    if (error || !data) throw new Error('No se pudo importar la encuesta predial')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const newEnc: EncuestaPredialRecord = {
      local_id:           crypto.randomUUID(),
      supabase_id:        remoteId,
      familia_local_id:   undefined,
      sync_status:        'synced',
      sync_error:         null,
      created_at:         d.created_at,
      updated_at:         d.updated_at ?? d.created_at,
      step_completed:     d.step_completed ?? 0,
      created_by:         d.created_by ?? '',
      nombre_propietario: d.nombre_propietario ?? '',
      municipio:          d.municipio ?? '',
      vereda:             d.vereda ?? '',
      fecha_encuesta:     d.fecha_encuesta ?? '',
      sec_general:        d.sec_general    ?? {},
      sec_vivienda:       d.sec_vivienda   ?? {},
      sec_familia:        d.sec_familia    ?? {},
      sec_economia:       d.sec_economia   ?? {},
      sec_cultivos:       d.sec_cultivos   ?? [],
      sec_ganaderia:      d.sec_ganaderia  ?? {},
      sec_tecnologia:     d.sec_tecnologia ?? {},
      sec_bosque:         d.sec_bosque     ?? {},
    }
    await db.encuestas.add(newEnc)
    await loadLocal()
    navigate(`/encuesta/${newEnc.local_id}`)
  }

  // ─── Importar familia remota (padre + hijos) ─────────────────────────────────
  async function handleOpenRemotePrediofamilia(predio: RemotePredio) {
    // ¿Ya existe local?
    const existingFam = await db.familias.where('supabase_id').equals(predio.id).first()
    if (existingFam) { navigate(`/familia/${existingFam.local_id}`); return }

    // Crear familia local
    const familiaLocalId = crypto.randomUUID()
    await db.familias.add({
      local_id:           familiaLocalId,
      supabase_id:        predio.id,
      sync_status:        'synced',
      sync_error:         null,
      created_at:         predio.created_at,
      updated_at:         predio.created_at,
      created_by:         predio.created_by ?? '',
      nombre_predio:      predio.nombre_predio      ?? '',
      nombre_propietario: predio.nombre_propietario ?? '',
      municipio:          predio.municipio           ?? '',
      vereda:             predio.vereda              ?? '',
      fecha:              predio.fecha               ?? '',
      contacto:           '',
      departamento:       'Caquetá',
      num_zonas:          predio.num_zonas           ?? 1,
    } as FamiliaRecord)

    // Intentar importar evaluación de campo vinculada (predio_id FK)
    try {
      const { data: evalData } = await evalTable()
        .select('*').eq('predio_id', predio.id).maybeSingle()
      if (evalData) {
        const existingEval = await db.evaluaciones.where('supabase_id').equals(evalData.id).first()
        if (!existingEval) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = evalData as any
          await db.evaluaciones.add({
            local_id:         crypto.randomUUID(),
            supabase_id:      d.id,
            familia_local_id: familiaLocalId,
            sync_status:      'synced',
            sync_error:       null,
            created_at:       d.created_at,
            updated_at:       d.updated_at ?? d.created_at,
            step_completed:   d.step_completed ?? 0,
            created_by:       d.created_by ?? '',
            nombre_predio:    d.nombre_predio ?? '',
            codigo_predio:    d.seccion_1_data?.codigo_predio ?? '',
            municipio:        d.seccion_1_data?.municipio ?? '',
            fecha_visita:     d.fecha_visita ?? '',
            num_zonas:        d.num_zonas_eval ?? predio.num_zonas ?? 1,
            seccion_1:        d.seccion_1_data ?? {},
            seccion_2:        d.seccion_2_data ?? {},
            zonas:            d.zonas_data ?? [],
            seccion_6:        d.seccion_6_data ?? {},
            seccion_7:        {},
          } as EvaluacionRecord)
        }
      }
    } catch { /* predio_id puede no estar aún en los registros anteriores */ }

    // Intentar importar encuesta predial vinculada
    try {
      const { data: encData } = await encTable()
        .select('*').eq('predio_id', predio.id).maybeSingle()
      if (encData) {
        const existingEnc = await db.encuestas.where('supabase_id').equals(encData.id).first()
        if (!existingEnc) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = encData as any
          await db.encuestas.add({
            local_id:           crypto.randomUUID(),
            supabase_id:        d.id,
            familia_local_id:   familiaLocalId,
            sync_status:        'synced',
            sync_error:         null,
            created_at:         d.created_at,
            updated_at:         d.updated_at ?? d.created_at,
            step_completed:     d.step_completed ?? 0,
            created_by:         d.created_by ?? '',
            nombre_propietario: d.nombre_propietario ?? '',
            municipio:          d.municipio ?? '',
            vereda:             d.vereda ?? '',
            fecha_encuesta:     d.fecha_encuesta ?? '',
            sec_general:        d.sec_general    ?? {},
            sec_vivienda:       d.sec_vivienda   ?? {},
            sec_familia:        d.sec_familia    ?? {},
            sec_economia:       d.sec_economia   ?? {},
            sec_cultivos:       d.sec_cultivos   ?? [],
            sec_ganaderia:      d.sec_ganaderia  ?? {},
            sec_tecnologia:     d.sec_tecnologia ?? {},
            sec_bosque:         d.sec_bosque     ?? {},
          } as EncuestaPredialRecord)
        }
      }
    } catch { /* idem */ }

    await loadLocal()
    navigate(`/familia/${familiaLocalId}`)
  }

  // ─── Índices de hijos por familia ────────────────────────────────────────────
  const evalsByFamilia: Record<string, EvaluacionRecord> = {}
  for (const e of evals) {
    if (e.familia_local_id) evalsByFamilia[e.familia_local_id] = e
  }
  const encsByFamilia: Record<string, EncuestaPredialRecord> = {}
  for (const n of encs) {
    if (n.familia_local_id) encsByFamilia[n.familia_local_id] = n
  }

  // Evals/encs sin familia = legacy
  const orphanEvals = evals.filter(e => !e.familia_local_id)
  const orphanEncs  = encs.filter(n => !n.familia_local_id)

  const pendingLocal = familias.filter(r => r.sync_status !== 'synced').length
    + predios.filter(r => r.sync_status !== 'synced').length
    + evals.filter(r => r.sync_status !== 'synced').length
    + encs.filter(r => r.sync_status !== 'synced').length

  const hasLegacy = predios.length > 0 || orphanEvals.length > 0 || orphanEncs.length > 0

  // Para "Todos": si hay predios en siembra.predios, mostrarlos; si no, mostrar las tablas legacy
  type MixedRemote = { type: 'eval'; data: RemoteEval } | { type: 'enc'; data: RemoteEnc }
  const mixedRemote: MixedRemote[] = [
    ...remoteEvals.map(e => ({ type: 'eval' as const, data: e })),
    ...remoteEncs.map(e  => ({ type: 'enc'  as const, data: e })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))

  const totalLocalCount = familias.length + predios.length + evals.length + encs.length
  const totalRemoteCount = remotePredios.length || mixedRemote.length

  if (!userName) return <UserSetup onComplete={name => setUserName(name)} />

  return (
    <div className="min-h-screen bg-[#f0fafa] flex flex-col">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Familias Resilientes</h1>
            <p className="text-xs opacity-75">Hola, {userName}</p>
          </div>
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${online ? 'bg-emerald-500/30 text-emerald-100' : 'bg-red-500/30 text-red-100'}`}>
            {online ? <Wifi size={12}/> : <WifiOff size={12}/>}
            {online ? 'Online' : 'Sin internet'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-black/20 p-1 rounded-xl">
          {([
            ['mios',  <User size={13}/>,      'Mis registros', totalLocalCount],
            ['todos', <Globe size={13}/>,     'Todos',          totalRemoteCount],
            ['stats', <BarChart2 size={13}/>, 'Estadísticas',   0],
          ] as const).map(([key, icon, label, count]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-colors ${tab === key ? 'bg-white text-[#0d7377]' : 'text-white/80'}`}>
              {icon} {label}
              {count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-[#0d7377] text-white' : 'bg-white/20'}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      <InstallBanner />

      {/* Barra de sync */}
      {pendingLocal > 0 && online && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-700">{pendingLocal} registro(s) pendiente(s)</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1 rounded-lg">
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''}/>
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 text-sm font-medium ${toast.isError ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {toast.msg}
        </div>
      )}

      {/* ── Mis registros ───────────────────────────────────────────────── */}
      {tab === 'mios' && (
        <main className="flex-1 px-4 py-4 space-y-3 pb-28">
          {familias.length === 0 && !hasLegacy ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus size={32} className="text-gray-300"/>
              </div>
              <p className="text-sm text-center">No tienes familias guardadas.<br/>Toca el botón + para crear una.</p>
            </div>
          ) : (
            <>
              {familias.map(f => (
                <LocalFamiliaCard
                  key={f.local_id}
                  familia={f}
                  campoEval={evalsByFamilia[f.local_id]}
                  predialEnc={encsByFamilia[f.local_id]}
                  onDelete={() => handleDeleteFamilia(f)}
                />
              ))}

              {hasLegacy && (
                <>
                  <p className="text-xs text-gray-400 px-1 pt-3">Registros anteriores</p>
                  {predios.map(p => (
                    <LocalPredioCard key={p.local_id} predio={p} onDelete={() => handleDeletePredio(p)} />
                  ))}
                  {orphanEvals.map(ev => (
                    <LocalEvalCard key={ev.local_id} ev={ev} onDelete={() => handleDeleteEval(ev)} />
                  ))}
                  {orphanEncs.map(enc => (
                    <LocalEncCard key={enc.local_id} enc={enc} onDelete={() => handleDeleteEnc(enc)} />
                  ))}
                </>
              )}
            </>
          )}
        </main>
      )}

      {/* ── Todos (Supabase) ─────────────────────────────────────────────── */}
      {tab === 'todos' && (
        <main className="flex-1 px-4 py-4 space-y-3 pb-28">
          {!online ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <WifiOff size={40} className="text-gray-300"/>
              <p className="text-sm text-center">Sin internet.<br/>Conéctate para ver los registros de todos.</p>
            </div>
          ) : loadingRemote ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]"/>
            </div>
          ) : (remotePredios.length === 0 && mixedRemote.length === 0) ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <Globe size={40} className="text-gray-300"/>
              <p className="text-sm text-center">No hay registros en la base de datos aún.</p>
            </div>
          ) : (
            <>
              {/* Nuevas familias desde siembra.predios */}
              {remotePredios.length > 0 && (
                <>
                  <p className="text-xs text-gray-400 px-1">{remotePredios.length} familia(s) en la nube · toca para importar</p>
                  {remotePredios.map(p => (
                    <RemotePredioCard
                      key={p.id}
                      predio={p}
                      onOpen={() => handleOpenRemotePrediofamilia(p)}
                    />
                  ))}
                </>
              )}

              {/* Registros legacy de evaluaciones_campo y familias */}
              {mixedRemote.length > 0 && (
                <>
                  {remotePredios.length > 0 && (
                    <p className="text-xs text-gray-400 px-1 pt-2">Registros anteriores en la nube · toca para importar</p>
                  )}
                  {!remotePredios.length && (
                    <p className="text-xs text-gray-400 px-1">
                      {remoteEvals.length} campo + {remoteEncs.length} predial en la nube · toca para importar
                    </p>
                  )}
                  {mixedRemote.map(item =>
                    item.type === 'eval'
                      ? <RemoteEvalCard
                          key={`re-${item.data.id}`}
                          ev={item.data}
                          onOpen={() => handleOpenRemoteEval(item.data.id)}
                        />
                      : <RemoteEncCard
                          key={`rn-${item.data.id}`}
                          enc={item.data}
                          onOpen={() => handleOpenRemoteEnc(item.data.id)}
                        />
                  )}
                </>
              )}

              <button onClick={loadRemote} className="w-full flex items-center justify-center gap-2 text-sm text-[#0d7377] py-3">
                <RefreshCw size={14}/> Actualizar lista
              </button>
            </>
          )}
        </main>
      )}

      {/* ── Estadísticas ─────────────────────────────────────────────────── */}
      {tab === 'stats' && <StatsTab />}

      {/* FAB → nueva familia */}
      <button
        onClick={() => navigate('/familia/nueva')}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#0d7377] text-white rounded-full shadow-lg flex items-center justify-center"
      >
        <Plus size={28}/>
      </button>
    </div>
  )
}
