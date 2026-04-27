import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff, Database, CloudOff } from 'lucide-react'
import { db } from '../db/schema'
import { supabase } from '../lib/supabase'
import { useOnlineStatus } from '../lib/useOnlineStatus'
import type { EvaluacionRecord } from '../types/evaluacion'
import type { EncuestaPredialRecord } from '../types/encuesta'

// ─── Tipos ─────────────────────────────────────────────────────────────────────
interface MuniStat { municipio: string; evaluaciones: number; encuestas: number }
interface EvalStat  { created_by: string | null; count: number }

interface StatsData {
  totalEvalLocal:      number
  totalEncLocal:       number
  pendingEval:         number
  pendingEnc:          number
  byMuni:              MuniStat[]
  byEvaluador:         EvalStat[]
  recentActivity:      RecentItem[]
  pctGanaderia:        number | null
  pctRegenerativa:     number | null
  // Remote (only when online)
  totalEvalRemote:     number | null
  totalEncRemote:      number | null
}

interface RecentItem {
  tipo:   'eval' | 'enc'
  nombre: string
  fecha:  string
}

// ─── Barra de progreso simple ───────────────────────────────────────────────
function Bar({ pct, color = 'bg-[#0d7377]' }: { pct: number; color?: string }) {
  return (
    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  )
}

// ─── Tarjeta de métrica ─────────────────────────────────────────────────────
function MetricCard({
  label, value, sub, color = 'text-[#0d7377]'
}: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

// ─── Stats Component ────────────────────────────────────────────────────────
export function StatsTab() {
  const online = useOnlineStatus()
  const [data, setData]       = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      // ── Datos locales ─────────────────────────────────────────────────────
      const evals = await db.evaluaciones.toArray() as EvaluacionRecord[]
      const encs  = await db.encuestas.toArray()    as EncuestaPredialRecord[]

      const pendingEval = evals.filter(e => e.sync_status !== 'synced').length
      const pendingEnc  = encs.filter(e => e.sync_status !== 'synced').length

      // Municipios
      const muniMap = new Map<string, MuniStat>()
      for (const e of evals) {
        const m = (e.seccion_1 as { municipio?: string })?.municipio || e.municipio || 'Sin municipio'
        if (!muniMap.has(m)) muniMap.set(m, { municipio: m, evaluaciones: 0, encuestas: 0 })
        muniMap.get(m)!.evaluaciones++
      }
      for (const e of encs) {
        const m = e.municipio || 'Sin municipio'
        if (!muniMap.has(m)) muniMap.set(m, { municipio: m, evaluaciones: 0, encuestas: 0 })
        muniMap.get(m)!.encuestas++
      }
      const byMuni = Array.from(muniMap.values())
        .sort((a, b) => (b.evaluaciones + b.encuestas) - (a.evaluaciones + a.encuestas))

      // Evaluadores
      const evalMap = new Map<string, number>()
      for (const e of evals) {
        const k = e.created_by || '(sin nombre)'
        evalMap.set(k, (evalMap.get(k) ?? 0) + 1)
      }
      for (const e of encs) {
        const k = e.created_by || '(sin nombre)'
        evalMap.set(k, (evalMap.get(k) ?? 0) + 1)
      }
      const byEvaluador = Array.from(evalMap.entries())
        .map(([created_by, count]) => ({ created_by, count }))
        .sort((a, b) => b.count - a.count)

      // Actividad reciente
      const allItems: RecentItem[] = [
        ...evals.map(e => ({
          tipo: 'eval' as const,
          nombre: e.nombre_predio || '(Sin nombre)',
          fecha: e.updated_at,
        })),
        ...encs.map(e => ({
          tipo: 'enc' as const,
          nombre: e.nombre_propietario || '(Sin nombre)',
          fecha: e.updated_at,
        })),
      ]
      const recentActivity = allItems
        .sort((a, b) => b.fecha.localeCompare(a.fecha))
        .slice(0, 5)

      // Ganadería
      const encsConGan = encs.filter(e => (e.sec_ganaderia as { tiene_ganaderia?: boolean })?.tiene_ganaderia)
      const encsConRegen = encs.filter(e => {
        const g = e.sec_ganaderia as { interes_ganaderia_regenerativa?: boolean }
        return g?.interes_ganaderia_regenerativa
      })
      const pctGanaderia    = encs.length > 0 ? Math.round((encsConGan.length / encs.length) * 100) : null
      const pctRegenerativa = encsConGan.length > 0 ? Math.round((encsConRegen.length / encsConGan.length) * 100) : null

      // ── Datos remotos (si hay internet) ──────────────────────────────────
      let totalEvalRemote: number | null = null
      let totalEncRemote:  number | null = null

      if (online) {
        const [{ count: ce }, { count: cn }] = await Promise.all([
          supabase.schema('siembra').from('evaluaciones_campo').select('*', { count: 'exact', head: true }),
          supabase.schema('siembra').from('familias').select('*', { count: 'exact', head: true }),
        ])
        totalEvalRemote = ce ?? null
        totalEncRemote  = cn ?? null
      }

      setData({
        totalEvalLocal:  evals.length,
        totalEncLocal:   encs.length,
        pendingEval,
        pendingEnc,
        byMuni,
        byEvaluador,
        recentActivity,
        pctGanaderia,
        pctRegenerativa,
        totalEvalRemote,
        totalEncRemote,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [online]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0d7377]" />
    </div>
  )

  if (!data) return null

  const maxMuni = Math.max(1, ...data.byMuni.map(m => m.evaluaciones + m.encuestas))
  const maxEval = Math.max(1, ...data.byEvaluador.map(e => e.count))

  return (
    <main className="flex-1 px-4 py-4 pb-28 space-y-5">

      {/* Actualizar */}
      <button
        onClick={load}
        className="flex items-center gap-1.5 text-xs text-[#0d7377] font-medium ml-auto"
      >
        <RefreshCw size={13} /> Actualizar
      </button>

      {/* Resumen */}
      <section>
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
          Resumen general
        </p>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Evaluaciones campo"
            value={data.totalEvalRemote ?? data.totalEvalLocal}
            sub={online && data.totalEvalRemote !== null ? '☁ En la nube' : `${data.totalEvalLocal} local(es)`}
          />
          <MetricCard
            label="Encuestas prediales"
            value={data.totalEncRemote ?? data.totalEncLocal}
            sub={online && data.totalEncRemote !== null ? '☁ En la nube' : `${data.totalEncLocal} local(es)`}
            color="text-emerald-600"
          />
        </div>
        {(data.pendingEval > 0 || data.pendingEnc > 0) && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <CloudOff size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              {data.pendingEval > 0 && `${data.pendingEval} evaluación(es) pendiente(s) de sync. `}
              {data.pendingEnc  > 0 && `${data.pendingEnc} encuesta(s) pendiente(s) de sync.`}
            </p>
          </div>
        )}
        {!online && (
          <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-start gap-2">
            <WifiOff size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-500">Mostrando datos locales. Conéctate para ver totales en la nube.</p>
          </div>
        )}
      </section>

      {/* Por municipio */}
      {data.byMuni.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            Por municipio
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 space-y-3">
            {data.byMuni.map(m => {
              const total = m.evaluaciones + m.encuestas
              return (
                <div key={m.municipio}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-700 font-medium truncate flex-1">{m.municipio}</span>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{total}</span>
                  </div>
                  <Bar pct={(total / maxMuni) * 100} />
                  <div className="flex gap-3 mt-1">
                    {m.evaluaciones > 0 && (
                      <span className="text-[10px] text-[#0d7377]">
                        {m.evaluaciones} eval.
                      </span>
                    )}
                    {m.encuestas > 0 && (
                      <span className="text-[10px] text-emerald-600">
                        {m.encuestas} enc.
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Por evaluador */}
      {data.byEvaluador.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            Por evaluador
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-3 space-y-3">
            {data.byEvaluador.map(e => (
              <div key={e.created_by ?? 'anon'}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700 font-medium truncate flex-1">
                    {e.created_by || '(sin nombre)'}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">{e.count}</span>
                </div>
                <Bar pct={(e.count / maxEval) * 100} color="bg-amber-400" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Ganadería */}
      {data.pctGanaderia !== null && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            Ganadería (encuestas locales)
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4 space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-gray-600">Familias con ganadería</span>
                <span className="text-xs font-bold text-[#0d7377]">{data.pctGanaderia}%</span>
              </div>
              <Bar pct={data.pctGanaderia} />
            </div>
            {data.pctRegenerativa !== null && (
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-600">Interés en ganadería regenerativa</span>
                  <span className="text-xs font-bold text-emerald-600">{data.pctRegenerativa}%</span>
                </div>
                <Bar pct={data.pctRegenerativa} color="bg-emerald-500" />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actividad reciente */}
      {data.recentActivity.length > 0 && (
        <section>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">
            Actividad reciente
          </p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {data.recentActivity.map((item, i) => (
              <div key={i} className={`px-4 py-3 flex items-center gap-3 ${i > 0 ? 'border-t border-gray-50' : ''}`}>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  item.tipo === 'eval'
                    ? 'bg-[#0d7377]/10 text-[#0d7377]'
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {item.tipo === 'eval' ? 'EVAL' : 'ENC'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 truncate">{item.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(item.fecha).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Estado sin datos */}
      {data.totalEvalLocal === 0 && data.totalEncLocal === 0 && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
          <Database size={40} className="text-gray-200" />
          <p className="text-sm text-center">
            Aún no hay registros locales.<br />
            Crea una evaluación o encuesta para ver estadísticas.
          </p>
        </div>
      )}

    </main>
  )
}
