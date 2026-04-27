import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, RefreshCw, Wifi, WifiOff, Trash2, ChevronRight,
  Copy, ChevronDown, ChevronUp, User, Globe, BarChart2,
} from 'lucide-react'
import { db } from '../db/schema'
import type { EvaluacionRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'
import type { PredioRecord } from '../types/predio'
import { syncPendingEvaluaciones, syncPendingEncuestas, syncPendingPredios } from '../lib/sync'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import { supabase } from '../lib/supabase'
import { InstallBanner } from '../components/ui/InstallBanner'
import { UserSetup } from '../components/ui/UserSetup'
import { StatsTab } from './Stats'

// ─── Tipos remotos ─────────────────────────────────────────────────────────────
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

// ─── Estado de sync ────────────────────────────────────────────────────────────
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

// ─── Tarjeta predio unificado (local) ──────────────────────────────────────────
function LocalPredioCard({ predio, onDelete }: { predio: PredioRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[predio.sync_status]
  const total    = 11 + 3 * Math.max(1, predio.num_zonas)
  const inProgress = predio.step_completed < total - 1

  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden ${predio.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3"
        onClick={() => navigate(`/predio/${predio.local_id}`)}>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-800 truncate">{predio.nombre_predio || '(Sin nombre)'}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {predio.municipio || '—'}
            {predio.vereda && ` · ${predio.vereda}`}
            {predio.fecha && ` · ${new Date(predio.fecha + 'T00:00:00').toLocaleDateString('es-CO')}`}
          </p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
            {inProgress && predio.sync_status !== 'synced' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Paso {predio.step_completed + 1}/{total}
              </span>
            )}
            <span className="text-xs text-gray-400">{predio.num_zonas} zona(s)</span>
            {predio.nombre_propietario && (
              <span className="text-xs text-gray-400 truncate">· {predio.nombre_propietario}</span>
            )}
          </div>
          {predio.sync_status === 'error' && predio.sync_error  && <ErrorPanel msg={predio.sync_error} />}
          {predio.sync_status === 'error' && !predio.sync_error && (
            <p className="text-xs text-red-500 mt-2">Error desconocido — intenta sincronizar de nuevo.</p>
          )}
        </div>
        <ChevronRight size={18} className="text-gray-300 flex-shrink-0 mt-1" />
      </button>
      <div className="border-t border-gray-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {new Date(predio.updated_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
        <button onClick={onDelete} className="text-xs text-red-400 flex items-center gap-1">
          <Trash2 size={12} /> Eliminar
        </button>
      </div>
    </div>
  )
}

// ─── Tarjeta evaluación legacy (local) ────────────────────────────────────────
function LocalEvalCard({ ev, onDelete }: { ev: EvaluacionRecord; onDelete: () => void }) {
  const navigate   = useNavigate()
  const st         = STATUS[ev.sync_status]
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden opacity-75 ${ev.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-3 pb-2 flex items-start gap-3"
        onClick={() => navigate(`/evaluacion/${ev.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">EVAL legacy</span>
            <p className="text-sm font-medium text-gray-700 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          </div>
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

// ─── Tarjeta encuesta legacy (local) ──────────────────────────────────────────
function LocalEncCard({ enc, onDelete }: { enc: EncuestaPredialRecord; onDelete: () => void }) {
  const navigate = useNavigate()
  const st       = STATUS[enc.sync_status]
  return (
    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden opacity-75 ${enc.sync_status === 'error' ? 'border-red-200' : 'border-gray-100'}`}>
      <button className="w-full text-left px-4 pt-3 pb-2 flex items-start gap-3"
        onClick={() => navigate(`/encuesta/${enc.local_id}`)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">ENC legacy</span>
            <p className="text-sm font-medium text-gray-700 truncate">{enc.nombre_propietario || '(Sin nombre)'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.color}`}>{st.label}</span>
          </div>
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
function RemoteEvalCard({ ev }: { ev: RemoteEval }) {
  const municipio = ev.seccion_1_data?.municipio ?? '—'
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377]">EVAL</span>
        <p className="font-semibold text-gray-800 truncate">{ev.nombre_predio || '(Sin nombre)'}</p>
      </div>
      <p className="text-xs text-gray-500 truncate">{municipio}{ev.fecha_visita && ` · ${new Date(ev.fecha_visita + 'T00:00:00').toLocaleDateString('es-CO')}`}</p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {ev.created_by && <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><User size={10}/>{ev.created_by}</span>}
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Nube</span>
      </div>
    </div>
  )
}

function RemoteEncCard({ enc }: { enc: RemoteEnc }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">PREDIAL</span>
        <p className="font-semibold text-gray-800 truncate">{enc.nombre_propietario || '(Sin nombre)'}</p>
      </div>
      <p className="text-xs text-gray-500 truncate">{enc.municipio || '—'}{enc.vereda && ` · ${enc.vereda}`}</p>
      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
        {enc.created_by && <span className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"><User size={10}/>{enc.created_by}</span>}
        <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">☁ Nube</span>
      </div>
    </div>
  )
}

// ─── Home ───────────────────────────────────────────────────────────────────────
export function Home() {
  const navigate = useNavigate()
  const online   = useOnlineStatus()

  const [tab, setTab]         = useState<'mios' | 'todos' | 'stats'>('mios')
  const [predios, setPredios] = useState<PredioRecord[]>([])
  const [evals, setEvals]     = useState<EvaluacionRecord[]>([])
  const [encs, setEncs]       = useState<EncuestaPredialRecord[]>([])
  const [remoteEvals, setRemoteEvals] = useState<RemoteEval[]>([])
  const [remoteEncs,  setRemoteEncs]  = useState<RemoteEnc[]>([])
  const [loadingRemote, setLoadingRemote] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [toast, setToast]     = useState<{ msg: string; isError: boolean } | null>(null)
  const [userName, setUserName] = useState<string | null>(
    () => localStorage.getItem('ae_campo_user')
  )

  // ─── Cargar datos locales ────────────────────────────────────────────────────
  const loadLocal = useCallback(async () => {
    const [p, e, n] = await Promise.all([
      db.predios.orderBy('updated_at').reverse().toArray(),
      db.evaluaciones.orderBy('updated_at').reverse().toArray(),
      db.encuestas.orderBy('updated_at').reverse().toArray(),
    ])
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

  useEffect(() => { if (tab === 'todos') loadRemote() }, [tab, loadRemote])

  // ─── Sync ────────────────────────────────────────────────────────────────────
  async function handleSync() {
    if (!online) return
    setSyncing(true)
    try {
      const [rp, re, rn] = await Promise.all([
        syncPendingPredios(),
        syncPendingEvaluaciones(),
        syncPendingEncuestas(),
      ])
      await loadLocal()
      const synced = rp.synced + re.synced + rn.synced
      const errors = rp.errors + re.errors + rn.errors
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

  const pendingLocal = predios.filter(r => r.sync_status !== 'synced').length
                     + evals.filter(r => r.sync_status !== 'synced').length
                     + encs.filter(r => r.sync_status !== 'synced').length

  if (!userName) return <UserSetup onComplete={name => setUserName(name)} />

  const hasLegacy = evals.length > 0 || encs.length > 0

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
          <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${online ? 'bg-emerald-500/30 text-emerald-100' : 'bg-red-500/30 text-red-100'}`}>
            {online ? <Wifi size={12}/> : <WifiOff size={12}/>}
            {online ? 'Online' : 'Sin internet'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-black/20 p-1 rounded-xl">
          {([
            ['mios',  <User size={13}/>,     'Mis registros', predios.length + evals.length + encs.length],
            ['todos', <Globe size={13}/>,    'Todos',          mixedRemote.length],
            ['stats', <BarChart2 size={13}/>, 'Estadísticas',  0],
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
          {predios.length === 0 && !hasLegacy ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center">
                <Plus size={32} className="text-gray-300"/>
              </div>
              <p className="text-sm text-center">No tienes registros guardados.<br/>Toca el botón + para empezar.</p>
            </div>
          ) : (
            <>
              {predios.map(p => (
                <LocalPredioCard key={p.local_id} predio={p} onDelete={() => handleDeletePredio(p)} />
              ))}
              {hasLegacy && (
                <>
                  <p className="text-xs text-gray-400 px-1 pt-2">Registros anteriores</p>
                  {evals.map(ev => <LocalEvalCard key={ev.local_id} ev={ev} onDelete={() => handleDeleteEval(ev)} />)}
                  {encs.map(enc => <LocalEncCard key={enc.local_id} enc={enc} onDelete={() => handleDeleteEnc(enc)} />)}
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
              <p className="text-xs text-gray-400 px-1">{remoteEvals.length} eval. + {remoteEncs.length} predial en la nube · Solo lectura</p>
              {mixedRemote.map(item =>
                item.type === 'eval'
                  ? <RemoteEvalCard  key={`re-${item.data.id}`} ev={item.data} />
                  : <RemoteEncCard   key={`rn-${item.data.id}`} enc={item.data} />
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

      {/* FAB simple → nuevo formulario unificado */}
      <button
        onClick={() => navigate('/predio/nueva')}
        className="fixed bottom-6 right-6 w-14 h-14 bg-[#0d7377] text-white rounded-full shadow-lg flex items-center justify-center"
      >
        <Plus size={28}/>
      </button>
    </div>
  )
}
