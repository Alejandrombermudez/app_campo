import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Search, RefreshCw, MapPin, Loader2, CheckCircle2 } from 'lucide-react'
import { db } from '../../db/schema'
import { newFamiliaDesdeHabilitado } from '../../types/familia'
import type { FamiliaRecord } from '../../types/familia'
import type { PredioHabilitado } from '../../types/core'
import { refreshPrediosHabilitados, getPrediosHabilitadosCache, fetchZonasPredio } from '../../lib/core'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Modo "editar": ficha de solo lectura del predio (viene de Jurídica+SIG) ──
function FichaPredio({ familia, onBack }: { familia: FamiliaRecord; onBack: () => void }) {
  const online = useOnlineStatus()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefreshZonas() {
    if (!familia.predio_core_id || !online || familia.es_practica) return
    setRefreshing(true)
    try {
      const { siembra, finca } = await fetchZonasPredio(familia.predio_core_id)
      await db.familias.update(familia.id!, {
        zonas_sig:   siembra,
        zonas_finca: finca,
        num_zonas:   siembra.length,
        updated_at:  new Date().toISOString(),
      })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f0fafa]">
      <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded"><ArrowLeft size={20} /></button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{familia.nombre_predio || '(Sin nombre)'}</p>
          <p className="text-xs opacity-60">Datos de Jurídica + SIG (solo lectura)</p>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-5 space-y-4 pb-10">
        {familia.es_practica && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-xs text-purple-700">
            Predio de práctica para capacitación — no es un predio real y nunca se sincroniza a Supabase.
          </div>
        )}
        {!familia.predio_core_id && !familia.es_practica && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
            Este registro se creó antes de conectar la app con Jurídica/SIG y no tiene predio de origen enlazado.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Predio</p>
          <p className="text-base font-semibold text-gray-800">{familia.nombre_predio || '—'}</p>
          <p className="text-sm text-gray-600">{familia.municipio}{familia.vereda && ` · ${familia.vereda}`}</p>
          <p className="text-xs text-gray-400">{familia.departamento}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Propietario / aliado</p>
          <p className="text-sm font-semibold text-gray-800">{familia.nombre_propietario || '—'}</p>
          {familia.contacto && <p className="text-sm text-gray-600">{familia.contacto}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Zonas del SIG</p>
            <button onClick={handleRefreshZonas} disabled={refreshing || !online || familia.es_practica}
              className="flex items-center gap-1 text-xs font-semibold text-[#0d7377] disabled:opacity-40">
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} /> Actualizar
            </button>
          </div>
          {familia.zonas_sig.length === 0 ? (
            <p className="text-sm text-gray-500">El SIG aún no ha subido zonas potenciales para este predio.</p>
          ) : (
            <ul className="space-y-1">
              {familia.zonas_sig.map((z, i) => (
                <li key={z.zona_id} className="text-sm text-gray-600 flex items-center justify-between">
                  <span>Zona {i + 1} · {z.estado}</span>
                  <span className="font-medium">{z.area_ha != null ? `${z.area_ha.toFixed(2)} ha` : '—'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  )
}

// ─── Estado de diligenciamiento remoto (quién ya llenó qué, por predio) ──────
export interface PredioSubmissionStatus {
  campo?:   string   // nombre de quien ya diligenció la Evaluación de Campo
  predial?: string   // nombre de quien ya diligenció la Encuesta Predial
}

// ─── Modo "nueva": selector de predios habilitados por Jurídica + SIG ────────
export function SelectorPredios({
  statusByPredio, embedded = false,
}: {
  statusByPredio?: Record<string, PredioSubmissionStatus>
  /** true cuando se usa dentro de un tab de Home (sin header propio con flecha "atrás") */
  embedded?: boolean
}) {
  const navigate = useNavigate()
  const online   = useOnlineStatus()
  const [predios, setPredios]   = useState<PredioHabilitado[]>([])
  const [loading, setLoading]   = useState(true)
  const [query, setQuery]       = useState('')
  const [opening, setOpening]   = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const cached = await getPrediosHabilitadosCache()
      if (!cancelled) setPredios(cached)
      if (online) {
        const fresh = await refreshPrediosHabilitados()
        if (!cancelled) setPredios(fresh)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [online])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return predios
    return predios.filter(p =>
      p.nombre_predio.toLowerCase().includes(q) ||
      p.nombre_propietario.toLowerCase().includes(q) ||
      p.municipio.toLowerCase().includes(q) ||
      p.vereda.toLowerCase().includes(q)
    )
  }, [predios, query])

  async function handleSelect(p: PredioHabilitado) {
    if (opening) return
    setOpening(p.predio_id)
    setError(null)
    try {
      // Reutilizar si ya se había abierto antes en este dispositivo
      const existing = await db.familias.where('predio_core_id').equals(p.predio_id).first()
      if (existing) { navigate(`/familia/${existing.local_id}`); return }

      const familia = newFamiliaDesdeHabilitado(p)
      await db.familias.add(familia)
      navigate(`/familia/${familia.local_id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setOpening(null)
    }
  }

  return (
    <div className={embedded ? 'flex flex-col' : 'min-h-screen flex flex-col bg-[#f0fafa]'}>
      {!embedded && (
        <header className="bg-[#0d7377] text-white px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="p-1 rounded"><ArrowLeft size={20} /></button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Predios habilitados para Campo</p>
            <p className="text-xs opacity-60">Ya pasaron por Jurídica + SIG</p>
          </div>
        </header>
      )}

      {error && (
        <div className="mx-4 mt-3 rounded-xl px-4 py-3 text-sm font-medium bg-red-50 text-red-700 border border-red-200">
          {error}
        </div>
      )}

      <div className="px-4 py-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por predio, propietario, municipio..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0d7377]"
          />
        </div>
      </div>

      <main className={`flex-1 px-4 pb-10 space-y-2 ${embedded ? '' : 'overflow-y-auto'}`}>
        {loading && predios.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-400">
            <MapPin size={40} className="text-gray-300" />
            <p className="text-sm text-center px-8">
              {online
                ? 'No hay predios habilitados para Campo todavía. Jurídica + SIG deben avanzar un expediente primero.'
                : 'Sin internet y sin predios en caché. Conéctate una vez para descargarlos.'}
            </p>
          </div>
        ) : (
          filtered.map(p => {
            const status = statusByPredio?.[p.predio_id]
            return (
              <button
                key={p.predio_id}
                onClick={() => handleSelect(p)}
                disabled={opening !== null}
                className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3.5 flex items-center gap-3 text-left active:bg-gray-50 disabled:opacity-60"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 truncate">{p.nombre_predio}</p>
                  <p className="text-xs text-gray-500 truncate">{p.nombre_propietario}</p>
                  <p className="text-xs text-gray-400 truncate">
                    {p.municipio}{p.vereda && ` · ${p.vereda}`} · {p.etapa === 'campo' ? 'Habilitado' : 'SIG II'}
                  </p>
                  {(status?.campo || status?.predial) && (
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {status.campo && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#0d7377]/10 text-[#0d7377]">
                          Campo ya diligenciado · {status.campo}
                        </span>
                      )}
                      {status.predial && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Predial ya diligenciado · {status.predial}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {opening === p.predio_id
                  ? <Loader2 size={18} className="text-[#0d7377] animate-spin flex-shrink-0" />
                  : <CheckCircle2 size={18} className="text-gray-200 flex-shrink-0" />}
              </button>
            )
          })
        )}
      </main>
    </div>
  )
}

// ─── Componente exportado: decide modo por la ruta ───────────────────────────
export function FamiliaPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const isEdit = !!id
  const [familia, setFamilia] = useState<FamiliaRecord | null>(null)
  const [loaded, setLoaded]   = useState(!isEdit)

  useEffect(() => {
    if (!isEdit) return
    db.familias.where('local_id').equals(id!).first().then(found => {
      setFamilia(found ?? null)
      setLoaded(true)
    })
  }, [id, isEdit])

  if (!isEdit) return <SelectorPredios />

  if (!loaded) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  if (!familia) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-8">
      <p className="text-sm text-center">Familia no encontrada.</p>
      <button onClick={() => navigate('/')} className="text-[#0d7377] text-sm font-semibold">Ir al inicio</button>
    </div>
  )

  return <FichaPredio familia={familia} onBack={() => navigate(`/familia/${id}`)} />
}
