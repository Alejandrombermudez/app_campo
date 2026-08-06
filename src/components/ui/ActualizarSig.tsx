import { useState } from 'react'
import {
  RefreshCw, WifiOff, AlertTriangle, ShieldCheck, X, Loader2,
  CheckCircle2, Satellite,
} from 'lucide-react'
import type { FamiliaRecord } from '../../types/familia'
import { consultarCambiosSig, aplicarCambiosSig, type DiffSig, type CambioZona } from '../../lib/actualizarSig'
import { useOnlineStatus } from '../../lib/useOnlineStatus'

// ─── Botón "Actualizar desde el SIG" ──────────────────────────────────────────
//
// Dos toques, siempre: el primero solo CONSULTA (no escribe nada en el
// celular), el segundo confirma sobre un resumen de qué va a cambiar. Así un
// toque por error en pleno terreno no puede dañar el trabajo, y sin señal ni
// siquiera lo intenta.

type Fase = 'idle' | 'consultando' | 'revisar' | 'aplicando' | 'listo'

const COLOR_CAMBIO: Record<CambioZona['tipo'], { cls: string; txt: string }> = {
  modificada: { cls: 'bg-blue-100 text-blue-700',   txt: 'Límite cambiado' },
  agregada:   { cls: 'bg-teal-100 text-teal-700',   txt: 'Zona nueva' },
  retirada:   { cls: 'bg-red-100 text-red-700',     txt: 'El SIG la quitó' },
}

function ha(n: number | null): string {
  return n != null ? `${n.toFixed(2)} ha` : '—'
}

function FilaCambio({ c }: { c: CambioZona }) {
  const color = COLOR_CAMBIO[c.tipo]
  return (
    <li className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{c.etiqueta}</p>
        <p className="text-xs text-gray-500">
          {c.tipo === 'agregada' ? ha(c.area_despues)
            : c.tipo === 'retirada' ? `${ha(c.area_antes)} · ya no está en el SIG`
            : `${ha(c.area_antes)} → ${ha(c.area_despues)}`}
        </p>
        {(c.datosCapturados || c.revisionPendiente) && (
          <p className="text-[11px] text-amber-700 mt-0.5">
            {c.datosCapturados && 'Ya tiene datos de la evaluación'}
            {c.datosCapturados && c.revisionPendiente && ' · '}
            {c.revisionPendiente && 'Tienes una corrección sin sincronizar'}
            {' — se conserva'}
          </p>
        )}
      </div>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${color.cls}`}>{color.txt}</span>
    </li>
  )
}

export function ActualizarSigCard({
  familia, onActualizado,
}: {
  familia: FamiliaRecord
  /** Se llama después de aplicar, para que la pantalla recargue sus datos. */
  onActualizado?: () => void | Promise<void>
}) {
  const online = useOnlineStatus()
  const [fase, setFase]   = useState<Fase>('idle')
  const [diff, setDiff]   = useState<DiffSig | null>(null)
  const [error, setError] = useState<string | null>(null)

  // El predio de práctica no existe en el SIG; los registros viejos sin enlace
  // a core tampoco tienen de dónde actualizarse.
  if (familia.es_practica || !familia.predio_core_id) return null

  async function consultar() {
    if (!online || fase !== 'idle') return
    setFase('consultando')
    setError(null)
    const res = await consultarCambiosSig(familia)
    if (!res.ok) {
      setDiff(null)
      setError(res.mensaje)
      setFase('revisar')
      return
    }
    setDiff(res.diff)
    setFase('revisar')
  }

  async function aplicar() {
    if (!diff || diff.bloqueo) return
    setFase('aplicando')
    try {
      await aplicarCambiosSig(familia, diff)
      setFase('listo')
      await onActualizado?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFase('revisar')
    }
  }

  function cerrar() {
    setFase('idle')
    setDiff(null)
    setError(null)
  }

  const ultima = familia.sig_actualizado_at
    ? new Date(familia.sig_actualizado_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })
    : null

  return (
    <>
      {/* Tarjeta */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
            <Satellite size={20} className="text-indigo-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800">Datos del SIG</p>
            <p className="text-xs text-gray-500">
              {familia.zonas_sig.length} zona(s) · límite de finca
              {ultima ? ` · revisado ${ultima}` : ' · descargado al abrir el predio'}
            </p>
          </div>
        </div>

        <button
          onClick={consultar}
          disabled={!online || fase === 'consultando'}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:bg-gray-100 disabled:text-gray-400"
        >
          {fase === 'consultando'
            ? <><Loader2 size={15} className="animate-spin" /> Consultando al SIG…</>
            : !online
              ? <><WifiOff size={15} /> Sin internet</>
              : <><RefreshCw size={15} /> Actualizar desde el SIG</>}
        </button>

        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">
          {online
            ? 'Trae el límite del predio y las zonas de siembra como están hoy en el SIG. Primero te muestra qué cambió y tú decides: nada se modifica sin que confirmes.'
            : 'Necesitas señal para actualizar. En terreno sigue trabajando con lo que ya descargaste — el botón no hace nada sin internet.'}
        </p>
      </div>

      {/* Modal */}
      {(fase === 'revisar' || fase === 'aplicando' || fase === 'listo') && (
        <div className="fixed inset-0 z-[2000] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col">

            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p className="text-base font-bold text-gray-800">
                {fase === 'listo' ? 'Predio actualizado' : 'Actualizar desde el SIG'}
              </p>
              {fase !== 'aplicando' && (
                <button onClick={cerrar} className="text-gray-400 p-1"><X size={18} /></button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2">

              {/* No se pudo consultar / error al aplicar */}
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}</p>
                </div>
              )}

              {/* Aplicado */}
              {fase === 'listo' && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>Ya tienes el límite del predio y las zonas como están hoy en el SIG. Lo que habías diligenciado sigue ahí.</span>
                </div>
              )}

              {/* El SIG no tiene zonas: no se aplica nada */}
              {fase === 'revisar' && diff?.bloqueo && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {diff.bloqueo}
                </div>
              )}

              {/* Sin cambios */}
              {fase === 'revisar' && diff && !diff.bloqueo && !diff.hayCambios && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-4 text-sm text-emerald-800 flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  <span>El SIG no ha cambiado nada de este predio. Lo que tienes en el celular está al día.</span>
                </div>
              )}

              {/* Hay cambios: resumen + garantías */}
              {fase !== 'listo' && diff && !diff.bloqueo && diff.hayCambios && (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    Esto es lo que el SIG cambió desde que descargaste el predio:
                  </p>

                  {diff.fincaCambio && (
                    <div className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2 text-sm text-gray-700 mb-3">
                      El <strong>límite del predio (finca)</strong> cambió.
                    </div>
                  )}

                  {diff.cambios.length > 0 && (
                    <ul className="mb-3">
                      {diff.cambios.map(c => <FilaCambio key={`${c.tipo}-${c.zona_id}`} c={c} />)}
                    </ul>
                  )}

                  {diff.advertencias.length > 0 && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 mb-3 space-y-2">
                      {diff.advertencias.map((a, i) => (
                        <p key={i} className="text-xs text-amber-800 flex items-start gap-2">
                          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {a}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <p className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 mb-1.5">
                      <ShieldCheck size={14} /> Nada de tu trabajo se borra
                    </p>
                    <ul className="text-[11px] text-emerald-800 space-y-1 leading-relaxed">
                      <li>· La Evaluación de Campo y la Encuesta Predial quedan igual.</li>
                      <li>· Tus correcciones de zonas se conservan, incluso las que faltan por sincronizar.</li>
                      <li>· Si el SIG quitó una zona que ya trabajaste, no se borra: queda marcada como retirada.</li>
                      <li>· Solo se reemplazan los dibujos (límite del predio y zonas).</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Acciones */}
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              {fase === 'revisar' && diff && !diff.bloqueo && diff.hayCambios ? (
                <>
                  <button onClick={cerrar}
                    className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold">
                    No, dejar como está
                  </button>
                  <button onClick={aplicar}
                    className="flex-1 py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold">
                    Sí, actualizar
                  </button>
                </>
              ) : fase === 'aplicando' ? (
                <button disabled className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-400 text-sm font-bold flex items-center justify-center gap-2">
                  <Loader2 size={15} className="animate-spin" /> Actualizando…
                </button>
              ) : (
                <button onClick={cerrar}
                  className="flex-1 py-3 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold">
                  Cerrar
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
