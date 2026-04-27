import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, RefreshCw, Wifi, WifiOff, Trash2, ChevronRight,
  Copy, ChevronDown, ChevronUp, User, Globe, BarChart2,
  ClipboardList, FileText, X,
} from 'lucide-react'
import { db } from '../db/schema'
import type { EvaluacionRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'
import { syncPendingEvaluaciones, syncPendingEncuestas } from '../lib/sync'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { supabase } from '../lib/supabase'
import { InstallBanner } from '../components/ui/InstallBanner'
import { UserSetup } from '../components/ui/UserSetup'
import { StatsTab } from './Stats'

// ─── Tipos remotos ─────────────────────────────────────────────────────────────
interface RemoteEval {
  id: string
  local_id: string | null
  nombre_predio: string | null
  fecha_visita: string | null
  num_zonas_eval: number | null
  created_by: string | null
  seccion_1_data: { municipio?: string } | null
  sync_origin: string | null
  created_at: string
}

interface RemoteEnc {
  id: string
  local_id: string | null
  nombre_propietario: string | null
  municipio: string | null
  vereda: string | null
  fecha_encuesta: string | null
  created_by: string | null
  created_at: string
}

// ─── Estado de sync ────────────────────────────────────────────────────────────
const STATUS: Record<'pending' | 'synced' | 'error', { label: string; color: string }> = {
  pending: { label: 'Pendiente',    color: 'bg-amber-100 text-amber-700' },
  synced:  { label: 'Sincronizado', color: 'bg-emerald-100 text-emerald-700' },
  error:   { label: '⚠ Error',      color: 'bg-red-100 text-red-700' },
}

// ─── Panel de error expandible ─────────────────────────────────────────────────
function ErrorPanel({ msg }: { msg: string }) {
  const [open, setOpen]     = useState(true)
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

// ─── Tarjeta evaluación local ──────────────────────────────────────────────────
function LocalEvalCard({ ev, onDelete }: { ev: EvaluacionRecord; onDelete: () => void }) {
  const navigate   = useNavigate()
  const st         = STATUS[ev.sync_status]
  const totalSteps = 4 + 3 * Math.max(1, ev.num_zonas ?? 1)
  const inProgress = ev.step_completed < totalSteps - 1

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
      ev.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'
    }`}>
      <button className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3"
        onClick={() => navigate(`/evaluacion/${ev.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377]">EVAL</span>
            <p className="font-semibold text-gray-800 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {ev.municipio || '—'}
            {ev.fecha_visita && ` · ${new Date(ev.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            {inProgress && ev.sync_status !== 'synced' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Paso {ev.step_completed + 1}/{totalSteps}
              </span>
            )}
            <span className="text-xs text-gray-400">{ev.num_zonas ?? 1} zona(s)</span>
          </div>
          {ev.sync_status === 'error' && ev.sync_error  && <ErrorPanel msg={ev.sync_error} />}
          {ev.sync_status === 'error' && !ev.sync_error && (
            <p className="text-xs text-red-500 mt-2">Error desconocido — intenta sincronizar de nuevo.</p>
          )}
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(ev.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta encuesta local ────────────────────────────────────────────────────
function LocalEncCard({ enc, onDelete }: { enc: EncuestaPredialRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[enc.sync_status]
  const total    = 8
  const inProgress = enc.step_completed < total - 1

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${
      enc.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'
    }`}>
      <button className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3"
        onClick={() => navigate(`/encuesta/${enc.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ENC</span>
            <p className="font-semibold text-gray-800 truncate">
              {enc.nombre_propietario || '(Sin nombre)'}
            </p>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {enc.municipio || '—'}
            {enc.vereda && ` · ${enc.vereda}`}
            {enc.fecha_encuesta && ` · ${new Date(enc.fecha_encuesta + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            {inProgress && enc.sync_status !== 'synced' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Paso {enc.step_completed + 1}/{total}
              </span>
            )}
          </div>
          {enc.sync_status === 'error' && enc.sync_error  && <ErrorPanel msg={enc.sync_error} />}
          {enc.sync_status === 'error' && !enc.sync_error && (
            <p className="text-xs text-red-500 mt-2">Error desconocido — intenta sincronizar de nuevo.</p>
          )}
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(enc.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta evaluación remota ─────────────────────────────────────────────────
function RemoteEvalCard({ ev }: { ev: RemoteEval }) {
  const municipio = ev.seccion_1_data?.municipio ?? '—'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377]">EVAL</span>
            <p className="font-semibold text-gray-800 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {municipio}
            {ev.fecha_visita && ` · ${new Date(ev.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {ev.created_by && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <User size={10} /> {ev.created_by}
              </span>
            )}
            <span className="text-xs text-gray-400">{ev.num_zonas_eval ?? 1} zona(s)</span>
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Nube</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Tarjeta encuesta remota ───────────────────────────────────────────────────
function RemoteEncCard({ enc }: { enc: RemoteEnc }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ENC</span>
            <p className="font-semibold text-gray-800 truncate">{enc.nombre_propietario || '(Sin nombre)'}</p>
          </div>
          <p className="text-xs text-gray-500 truncate">
            {enc.municipio || '—'}
            {enc.vereda && ` · ${enc.vereda}`}
            {enc.fecha_encuesta && ` · ${new Date(enc.fecha_encuesta + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {enc.created_by && (
              <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                <User size={10} /> {enc.created_by}
              </span>
            )}
            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Nube</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate()
  const online   = useOnlineStatus()

  const [tab, setTab]           = useState<'mios' | 'todos' | 'stats'>('mios')
  const [evals, setEvals]       = useState<EvaluacionRecord[]>([])
  const [encs, setEncs]         = useState<EncuestaPredialRecord[]>([])
  const [remoteEvals, setRemoteEvals] = useState<RemoteEval[]>([])
  const [remoteEncs,  setRemoteEncs]  = useState<RemoteEnc[]>([])
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [syncing, setSyncing]   = useState(false)
  const [toast, setToast]       = useState<{ msg: string; isError: boolean } | null>(null)
  const [fabOpen, setFabOpen]   = useState(false)
  const [userName, setUserName] = useState<string | null>(
    () => localStorage.getItem('ae_campo_user')
  )
  const fabRef = useRef<HTMLDivElement>(null)

  // ─── Cerrar FAB al hacer clic fuera ─────────────────────────────────────────
  useEffect(() => {
    if (!fabOpen) return
    function handleClick(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setFabOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [fabOpen])

  // ─── Cargar registros locales ────────────────────────────────────────────────
  const loadLocal = useCallback(async () => {
    const [allEvals, allEncs] = await Promise.all([
      db.evaluaciones.orderBy('updated_at').reverse().toArray(),
      db.encuestas.orderBy('updated_at').reverse().toArray(),
    ])
    setEvals(allEvals as EvaluacionRecord[])
    setEncs(allEncs as EncuestaPredialRecord[])
  }, [])

  useEffect(() => { loadLocal() }, [loadLocal])

  // ─── Cargar registros remotos ─────────────────────────────────────────────────
  const loadRemote = useCallback(async () => {
    if (!online) return
    setLoadingRemote(true)
    try {
      const [{ data: de }, { data: dn }] = await Promise.all([
        supabase.schema('siembra').from('evaluaciones_campo')
          .select('id, local_id, nombre_predio, fecha_visita, num_zonas_eval, created_by, seccion_1_data, sync_origin, created_at')
          .order('created_at', { ascending: false }).limit(50),
        supabase.schema('siembra').from('familias')
          .select('id, local_id, nombre_propietario, municipio, vereda, fecha_encuesta, created_by, created_at')
          .order('created_at', { ascending: false }).limit(50),
      ])
      if (de) setRemoteEvals(de as RemoteEval[])
      if (dn) setRemoteEncs(dn  as RemoteEnc[])
    } finally {
      setLoadingRemote(false)
    }
  }, [online])

  useEffect(() => {
    if (tab === 'todos') loadRemote()
  }, [tab, loadRemote])

  // ─── Sync ────────────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!online) return
    setSyncing(true)
    try {
      const [resEval, resEnc] = await Promise.all([
        syncPendingEvaluaciones(),
        syncPendingEncuestas(),
      ])
      await loadLocal()
      const synced = resEval.synced + resEnc.synced
      const errors = resEval.errors + resEnc.errors
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

  const localTotal   = evals.length + encs.length
  const pendingLocal = evals.filter(r => r.sync_status !== 'synced').length
                     + encs.filter(r => r.sync_status !== 'synced').length

  // ─── Configuración de usuario ────────────────────────────────────────────────
  if (!userName) {
    return <UserSetup onComplete={name => setUserName(name)} />
  }

  // ─── Mezclado y ordenado por fecha para "Mis registros" ──────────────────────
  type MixedLocal = { type: 'eval'; data: EvaluacionRecord } | { type: 'enc'; data: EncuestaPredialRecord }
  const mixedLocal: MixedLocal[] = [
    ...evals.map(e => ({ type: 'eval' as const, data: e })),
    ...encs.map(e => ({ type: 'enc'  as const, data: e })),
  ].sort((a, b) => b.data.updated_at.localeCompare(a.data.updated_at))

  type MixedRemote = { type: 'eval'; data: RemoteEval } | { type: 'enc'; data: RemoteEnc }
  const mixedRemote: MixedRemote[] = [
    ...remoteEvals.map(e => ({ type: 'eval' as const, data: e })),
    ...remoteEncs.map(e => ({ type: 'enc'  as const, data: e })),
  ].sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))

  return (
    <div className="min-h-screen bg-[#f0fafa] flex flex-col">

      {/* Header */}
      <header className="bg-[#0d7377] text-white px-4 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">Familias Resilientes</h1>
            <p className="text-xs opacity-75">Hola, {userName}</p>
          </div>
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
            online ? 'bg-emerald-500/30 text-emerald-100' : 'bg-red-500/30 text-red-100'
          }`}>
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            {online ? 'Online' : 'Sin internet'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-black/20 p-1 rounded-xl">
          <button
            onClick={() => setTab('mios')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
              tab === 'mios' ? 'bg-white text-[#0d7377]' : 'text-white/80'
            }`}
          >
            <User size={13} /> Mis registros
            {localTotal > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === 'mios' ? 'bg-[#0d7377] text-white' : 'bg-white/20'
              }`}>{localTotal}</span>
            )}
          </button>
          <button
            onClick={() => setTab('todos')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
              tab === 'todos' ? 'bg-white text-[#0d7377]' : 'text-white/80'
            }`}
          >
            <Globe size={13} /> Todos
            {mixedRemote.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                tab === 'todos' ? 'bg-[#0d7377] text-white' : 'bg-white/20'
              }`}>{mixedRemote.length}</span>
            )}
          </button>
          <button
            onClick={() => setTab('stats')}
            className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-lg transition-colors ${
              tab === 'stats' ? 'bg-white text-[#0d7377]' : 'text-white/80'
            }`}
          >
            <BarChart2 size={13} /> Estadísticas
          </button>
        </div>
      </header>

      {/* Banner de instalación */}
      <InstallBanner />

      {/* Barra de sync */}
      {pendingLocal > 0 && online && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between">
          <span className="text-xs text-amber-700">{pendingLocal} registro(s) pendiente(s)</span>
          <button onClick={handleSync} disabled={syncing}
            className="flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-3 py-1 rounded-lg">
            <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Sincronizando…' : 'Sincronizar'}
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`mx-4 mt-3 rounded-xl px-4 py-3 text-sm font-medium ${
          toast.isError
            ? 'bg-red-50 text-red-700 border border-red-200'
            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {toast.msg}
        </div>
      )}

      {/* ── Pestaña: Mis registros ─────────────────────────────────────────── */}
      {tab === 'mios' && (
        <main className="flex-1 px-4 py-4 space-y-3 pb-28">
          {mixedLocal.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus size={32} className="text-gray-300" />
              </div>
              <p className="text-sm text-center">
                No tienes registros guardados.<br />Toca el botón + para empezar.
              </p>
            </div>
          ) : (
            mixedLocal.map(item =>
              item.type === 'eval'
                ? <LocalEvalCard key={`eval-${item.data.local_id}`} ev={item.data} onDelete={() => handleDeleteEval(item.data)} />
                : <LocalEncCard  key={`enc-${item.data.local_id}`}  enc={item.data} onDelete={() => handleDeleteEnc(item.data)} />
            )
          )}
        </main>
      )}

      {/* ── Pestaña: Todos (Supabase) ──────────────────────────────────────── */}
      {tab === 'todos' && (
        <main className="flex-1 px-4 py-4 space-y-3 pb-28">
          {!online ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <WifiOff size={40} className="text-gray-300" />
              <p className="text-sm text-center">
                Sin internet.<br />Conéctate para ver los registros de todos.
              </p>
            </div>
          ) : loadingRemote ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
            </div>
          ) : mixedRemote.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
              <Globe size={40} className="text-gray-300" />
              <p className="text-sm text-center">No hay registros en la base de datos aún.</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-400 px-1">
                {remoteEvals.length} eval. + {remoteEncs.length} enc. en la nube · Solo lectura
              </p>
              {mixedRemote.map(item =>
                item.type === 'eval'
                  ? <RemoteEvalCard key={`reval-${item.data.id}`} ev={item.data} />
                  : <RemoteEncCard  key={`renc-${item.data.id}`}  enc={item.data} />
              )}
              <button
                onClick={loadRemote}
                className="w-full flex items-center justify-center gap-2 text-sm text-[#0d7377] py-3"
              >
                <RefreshCw size={14} /> Actualizar lista
              </button>
            </>
          )}
        </main>
      )}

      {/* ── Pestaña: Estadísticas ──────────────────────────────────────────── */}
      {tab === 'stats' && <StatsTab />}

      {/* FAB con menú desplegable */}
      <div ref={fabRef} className="fixed bottom-6 right-6 flex flex-col items-end gap-3">
        {/* Opciones del menú */}
        {fabOpen && (
          <>
            <button
              onClick={() => { setFabOpen(false); navigate('/encuesta/nueva') }}
              className="flex items-center gap-2 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-lg"
            >
              <FileText size={16} />
              Nueva encuesta predial
            </button>
            <button
              onClick={() => { setFabOpen(false); navigate('/evaluacion/nueva') }}
              className="flex items-center gap-2 bg-[#0d7377] text-white text-sm font-medium px-4 py-3 rounded-2xl shadow-lg"
            >
              <ClipboardList size={16} />
              Nueva evaluación campo
            </button>
          </>
        )}
        {/* Botón principal */}
        <button
          onClick={() => setFabOpen(o => !o)}
          className={`w-14 h-14 text-white rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
            fabOpen ? 'bg-gray-600 rotate-45' : 'bg-[#0d7377]'
          }`}
        >
          {fabOpen ? <X size={24} /> : <Plus size={28} />}
        </button>
      </div>
    </div>
  )
}
