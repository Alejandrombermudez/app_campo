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
import type { PredioHabilitado } from '../types/core'
import {
  syncPendingRevisiones,
  syncPendingEvaluaciones,
  syncPendingEncuestas,
  syncPendingPredios,
} from '../lib/sync'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { evalTable, encTable } from '../lib/supabase'
import { getPrediosHabilitadosCache } from '../lib/core'
import { newFamiliaDesdeHabilitado } from '../types/familia'
import { crearFamiliaPractica } from '../lib/practica'
import { InstallBanner } from '../components/ui/InstallBanner'
import { UserSetup } from '../components/ui/UserSetup'
import { StatsTab } from './Stats'

// ─── Tipos remotos ─────────────────────────────────────────────────────────────
// predio_id apunta a core.predios (ver migration_campo_core.sql); nombre/municipio
// ya no viajan como columnas propias — se resuelven contra la caché de predios
// habilitados (core.v_predios_campo).
interface RemoteEval {
  id: string; local_id: string | null
  fecha_visita: string | null; num_zonas_eval: number | null
  created_by: string | null
  sync_origin: string | null; created_at: string
  predio_id: string | null; step_completed: number | null
}
interface RemoteEnc {
  id: string; local_id: string | null
  fecha_encuesta: string | null; created_by: string | null; created_at: string
  predio_id: string | null; step_completed: number | null
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
          <div className="flex items-center gap-2">
            {familia.es_practica && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 flex-shrink-0">PRÁCTICA</span>
            )}
            <p className="font-semibold text-gray-800 truncate">{familia.nombre_predio || '(Sin nombre)'}</p>
          </div>
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
function RemoteEvalCard({
  ev, predio, onOpen, onDelete,
}: {
  ev: RemoteEval
  predio?: PredioHabilitado
  onOpen: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [loading,   setLoading]   = useState(false)
  const [deleting,  setDeleting]  = useState(false)

  async function handle() {
    setLoading(true)
    try { await onOpen() } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    try { await onDelete() } catch (err) { console.error(err) } finally { setDeleting(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={handle} disabled={loading || deleting}
        className="w-full text-left px-4 pt-4 pb-3 active:bg-gray-50 disabled:opacity-60">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377] flex-shrink-0">CAMPO</span>
            <p className="font-semibold text-gray-800 truncate">{predio?.nombre_predio ?? '(predio sin caché local)'}</p>
          </div>
          {loading
            ? <Loader2 size={16} className="text-[#0d7377] animate-spin flex-shrink-0"/>
            : <Download size={16} className="text-gray-300 flex-shrink-0"/>}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {predio?.municipio ?? '—'}{ev.fecha_visita && ` · ${new Date(ev.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
        </p>
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          {ev.created_by && <><User size={10}/>{ev.created_by}</>}
        </span>
        <button onClick={handleDelete} disabled={loading || deleting}
          className="text-xs text-red-400 flex items-center gap-1 disabled:opacity-40">
          {deleting ? <Loader2 size={11} className="animate-spin"/> : <Trash2 size={11}/>} Eliminar
        </button>
      </div>
    </div>
  )
}

function RemoteEncCard({
  enc, predio, onOpen, onDelete,
}: {
  enc: RemoteEnc
  predio?: PredioHabilitado
  onOpen: () => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [loading,  setLoading]  = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handle() {
    setLoading(true)
    try { await onOpen() } catch (e) { console.error(e) } finally { setLoading(false) }
  }
  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    try { await onDelete() } catch (err) { console.error(err) } finally { setDeleting(false) }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <button onClick={handle} disabled={loading || deleting}
        className="w-full text-left px-4 pt-4 pb-3 active:bg-gray-50 disabled:opacity-60">
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 flex-shrink-0">PREDIAL</span>
            <p className="font-semibold text-gray-800 truncate">{predio?.nombre_propietario ?? '(predio sin caché local)'}</p>
          </div>
          {loading
            ? <Loader2 size={16} className="text-emerald-600 animate-spin flex-shrink-0"/>
            : <Download size={16} className="text-gray-300 flex-shrink-0"/>}
        </div>
        <p className="text-xs text-gray-500 truncate">
          {predio?.municipio ?? '—'}{predio?.vereda && ` · ${predio.vereda}`}
        </p>
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400 flex items-center gap-1">
          {enc.created_by && <><User size={10}/>{enc.created_by}</>}
        </span>
        <button onClick={handleDelete} disabled={loading || deleting}
          className="text-xs text-red-400 flex items-center gap-1 disabled:opacity-40">
          {deleting ? <Loader2 size={11} className="animate-spin"/> : <Trash2 size={11}/>} Eliminar
        </button>
      </div>
    </div>
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
  const [remoteEvals,   setRemoteEvals]   = useState<RemoteEval[]>([])
  const [remoteEncs,    setRemoteEncs]    = useState<RemoteEnc[]>([])
  const [prediosCache, setPrediosCache]   = useState<Record<string, PredioHabilitado>>({})
  const [pendingRevs, setPendingRevs]     = useState(0)
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [syncing, setSyncing]       = useState(false)
  const [toast, setToast]           = useState<{ msg: string; isError: boolean } | null>(null)
  const [userName, setUserName]     = useState<string | null>(
    () => localStorage.getItem('ae_campo_user')
  )

  // ─── Cargar datos locales ────────────────────────────────────────────────────
  const loadLocal = useCallback(async () => {
    const [f, p, e, n, rv] = await Promise.all([
      db.familias.orderBy('updated_at').reverse().toArray(),
      db.predios.orderBy('updated_at').reverse().toArray(),
      db.evaluaciones.orderBy('updated_at').reverse().toArray(),
      db.encuestas.orderBy('updated_at').reverse().toArray(),
      db.revisiones.where('sync_status').anyOf(['pending', 'error']).count(),
    ])
    setFamilias(f as FamiliaRecord[])
    setPredios(p as PredioRecord[])
    setEvals(e as EvaluacionRecord[])
    setEncs(n as EncuestaPredialRecord[])
    setPendingRevs(rv)
  }, [])

  // Predio de práctica (capacitación): asegura que cualquiera que abra la app
  // por primera vez en este dispositivo tenga uno listo, sin depender de
  // Supabase ni de un predio real habilitado por Jurídica+SIG.
  // Transacción 'rw': React StrictMode (dev) invoca este efecto dos veces al
  // montar: sin la transacción, ambas pasadas podrían leer "no existe" antes
  // de que la otra insertara, duplicando el predio de práctica.
  useEffect(() => {
    (async () => {
      await db.transaction('rw', db.familias, async () => {
        const existente = await db.familias.filter(f => f.es_practica === true).first()
        if (!existente) await db.familias.add(crearFamiliaPractica())
      })
      await loadLocal()
    })()
  }, [loadLocal])

  // ─── Cargar datos remotos ────────────────────────────────────────────────────
  const loadRemote = useCallback(async () => {
    if (!online) return
    setLoadingRemote(true)
    try {
      const [{ data: de }, { data: dn }, cache] = await Promise.all([
        evalTable()
          .select('id, local_id, fecha_visita, num_zonas_eval, created_by, sync_origin, created_at, predio_id, step_completed')
          .order('created_at', { ascending: false }).limit(100),
        encTable()
          .select('id, local_id, fecha_encuesta, created_by, created_at, predio_id, step_completed')
          .order('created_at', { ascending: false }).limit(100),
        getPrediosHabilitadosCache(),
      ])
      if (de) setRemoteEvals(de as RemoteEval[])
      if (dn) setRemoteEncs(dn as RemoteEnc[])
      setPrediosCache(Object.fromEntries(cache.map(p => [p.predio_id, p])))
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
      // Revisiones de zonas primero: corrigen geo.zonas en el servidor
      const rz = await syncPendingRevisiones()
      const [re, rn, rp] = await Promise.all([
        syncPendingEvaluaciones(),
        syncPendingEncuestas(),
        syncPendingPredios(),
      ])
      await loadLocal()
      const synced = rz.synced + re.synced + rn.synced + rp.synced
      const errors = rz.errors + re.errors + rn.errors + rp.errors
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

  // ─── Encontrar o crear la familia local para un predio_id (core) ────────────
  async function ensureFamiliaLocal(predioId: string): Promise<string | undefined> {
    const existing = await db.familias.where('predio_core_id').equals(predioId).first()
    if (existing) return existing.local_id
    const cached = prediosCache[predioId]
    if (!cached) return undefined
    const familia = newFamiliaDesdeHabilitado(cached)
    await db.familias.add(familia)
    return familia.local_id
  }

  // ─── Importar registro remoto (campo) y abrir localmente ────────────────────
  async function handleOpenRemoteEval(ev: RemoteEval) {
    const existing = await db.evaluaciones.where('supabase_id').equals(ev.id).first()
    if (existing) {
      if (!existing.familia_local_id && ev.predio_id) {
        const familiaLocalId = await ensureFamiliaLocal(ev.predio_id)
        if (familiaLocalId) await db.evaluaciones.update(existing.id!, { familia_local_id: familiaLocalId })
      }
      navigate(`/evaluacion/${existing.local_id}`)
      return
    }

    const { data, error } = await evalTable().select('*').eq('id', ev.id).single()
    if (error || !data) throw new Error('No se pudo importar el registro de campo')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const familia_local_id = ev.predio_id ? await ensureFamiliaLocal(ev.predio_id) : undefined
    const cached = ev.predio_id ? prediosCache[ev.predio_id] : undefined

    const newEval: EvaluacionRecord = {
      local_id:         crypto.randomUUID(),
      supabase_id:      ev.id,
      familia_local_id,
      sync_status:      'synced',
      sync_error:       null,
      created_at:       d.created_at,
      updated_at:       d.updated_at ?? d.created_at,
      step_completed:   d.step_completed ?? 0,
      created_by:       d.created_by ?? '',
      nombre_predio:    cached?.nombre_predio ?? '',
      codigo_predio:    d.seccion_1_data?.codigo_predio ?? '',
      municipio:        cached?.municipio ?? '',
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
    if (familia_local_id) navigate(`/familia/${familia_local_id}`)
    else navigate(`/evaluacion/${newEval.local_id}`)
  }

  // ─── Importar registro remoto (predial) y abrir localmente ──────────────────
  async function handleOpenRemoteEnc(enc: RemoteEnc) {
    const existing = await db.encuestas.where('supabase_id').equals(enc.id).first()
    if (existing) {
      if (!existing.familia_local_id && enc.predio_id) {
        const familiaLocalId = await ensureFamiliaLocal(enc.predio_id)
        if (familiaLocalId) await db.encuestas.update(existing.id!, { familia_local_id: familiaLocalId })
      }
      navigate(`/encuesta/${existing.local_id}`)
      return
    }

    const { data, error } = await encTable().select('*').eq('id', enc.id).single()
    if (error || !data) throw new Error('No se pudo importar la encuesta predial')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    const familia_local_id = enc.predio_id ? await ensureFamiliaLocal(enc.predio_id) : undefined
    const cached = enc.predio_id ? prediosCache[enc.predio_id] : undefined

    const newEnc: EncuestaPredialRecord = {
      local_id:           crypto.randomUUID(),
      supabase_id:        enc.id,
      familia_local_id,
      sync_status:        'synced',
      sync_error:         null,
      created_at:         d.created_at,
      updated_at:         d.updated_at ?? d.created_at,
      step_completed:     d.step_completed ?? 0,
      created_by:         d.created_by ?? '',
      nombre_propietario: cached?.nombre_propietario ?? '',
      municipio:          cached?.municipio ?? '',
      vereda:             cached?.vereda ?? '',
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
    if (familia_local_id) navigate(`/familia/${familia_local_id}`)
    else navigate(`/encuesta/${newEnc.local_id}`)
  }

  // ─── Eliminar evaluación de campo remota ─────────────────────────────────────
  async function handleDeleteRemoteEval(ev: RemoteEval) {
    if (!window.confirm('¿Eliminar este formulario de campo?\n\nEsto borra el dato de la nube y no se puede deshacer.')) return
    try {
      const { data: deleted, error: delErr } = await evalTable()
        .delete().eq('id', ev.id).select('id')
      if (delErr) throw new Error(delErr.message || JSON.stringify(delErr))
      if (!deleted || deleted.length === 0) {
        throw new Error('RLS bloqueó el borrado. Agrega la política DELETE en Supabase → SQL Editor.')
      }
      const localEval = await db.evaluaciones.where('supabase_id').equals(ev.id).first()
      if (localEval) {
        await db.photos.where('local_evaluacion_id').equals(localEval.local_id).delete()
        await db.evaluaciones.delete(localEval.id!)
      }
      await loadLocal()
      await loadRemote()
      setToast({ msg: '✓ Formulario de campo eliminado', isError: false })
    } catch (err) {
      setToast({ msg: `Error al eliminar: ${err instanceof Error ? err.message : String(err)}`, isError: true })
    }
    setTimeout(() => setToast(null), 5000)
  }

  // ─── Eliminar encuesta predial remota ────────────────────────────────────────
  async function handleDeleteRemoteEnc(enc: RemoteEnc) {
    if (!window.confirm('¿Eliminar esta encuesta predial?\n\nEsto borra el dato de la nube y no se puede deshacer.')) return
    try {
      const { data: deleted, error: delErr } = await encTable()
        .delete().eq('id', enc.id).select('id')
      if (delErr) throw new Error(delErr.message || JSON.stringify(delErr))
      if (!deleted || deleted.length === 0) {
        throw new Error('RLS bloqueó el borrado. Agrega la política DELETE en Supabase → SQL Editor.')
      }
      const localEnc = await db.encuestas.where('supabase_id').equals(enc.id).first()
      if (localEnc) await db.encuestas.delete(localEnc.id!)
      await loadLocal()
      await loadRemote()
      setToast({ msg: '✓ Encuesta predial eliminada', isError: false })
    } catch (err) {
      setToast({ msg: `Error al eliminar: ${err instanceof Error ? err.message : String(err)}`, isError: true })
    }
    setTimeout(() => setToast(null), 5000)
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
    + pendingRevs

  const hasLegacy = predios.length > 0 || orphanEvals.length > 0 || orphanEncs.length > 0

  type MixedRemote = { type: 'eval'; data: RemoteEval } | { type: 'enc'; data: RemoteEnc }
  const mixedRemote: MixedRemote[] = [
    ...remoteEvals.map(e => ({ type: 'eval' as const, data: e })),
    ...remoteEncs.map(e  => ({ type: 'enc'  as const, data: e })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))

  const totalLocalCount = familias.length + predios.length + evals.length + encs.length

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
            ['todos', <Globe size={13}/>,     'Todos',          mixedRemote.length],
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
              <p className="text-sm text-center">No tienes predios abiertos.<br/>Toca el botón + para elegir uno habilitado por Jurídica + SIG.</p>
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
          ) : mixedRemote.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <Globe size={40} className="text-gray-300"/>
              <p className="text-sm text-center">No hay registros en la base de datos aún.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 px-1">
                {mixedRemote.filter(m => m.type === 'eval').length} campo +&nbsp;
                {mixedRemote.filter(m => m.type === 'enc').length} predial en la nube · toca para importar
              </p>
              {mixedRemote.map(item =>
                item.type === 'eval'
                  ? <RemoteEvalCard
                      key={`re-${item.data.id}`}
                      ev={item.data}
                      predio={item.data.predio_id ? prediosCache[item.data.predio_id] : undefined}
                      onOpen={() => handleOpenRemoteEval(item.data)}
                      onDelete={() => handleDeleteRemoteEval(item.data)}
                    />
                  : <RemoteEncCard
                      key={`rn-${item.data.id}`}
                      enc={item.data}
                      predio={item.data.predio_id ? prediosCache[item.data.predio_id] : undefined}
                      onOpen={() => handleOpenRemoteEnc(item.data)}
                      onDelete={() => handleDeleteRemoteEnc(item.data)}
                    />
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

      {/* FAB → elegir predio habilitado */}
      <button
        onClick={() => navigate('/familia/nueva')}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#0d7377] text-white rounded-full shadow-lg flex items-center justify-center"
      >
        <Plus size={28}/>
      </button>
    </div>
  )
}
