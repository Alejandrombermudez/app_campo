import { useState } from 'react'
import { Download, RefreshCw, CheckCircle2, ArrowUpCircle } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useInstallPrompt } from '../../lib/useInstallPrompt'
import { InstallBanner } from './InstallBanner'

/**
 * Dos botones siempre a la mano, sin buscar en menús:
 *  · Instalar app: con el aviso nativo de Chrome si lo hay; si no, las instrucciones.
 *  · Actualizar: busca una versión nueva y, si hay, la pone al pulsar. La versión nueva
 *    NO se aplica sola (la persona decide cuándo recargar, para no cortar un formulario).
 */
export function AppAcciones() {
  const { isInstalled, canInstall, prompt } = useInstallPrompt()
  const [instrucciones, setInstrucciones] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [registro, setRegistro] = useState<ServiceWorkerRegistration | null>(null)

  const { needRefresh: [hayNueva], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, r) {
      if (!r) return
      setRegistro(r)
      // Mirar si hay versión nueva al abrir y cada hora mientras esté abierta
      setInterval(() => { if (navigator.onLine) r.update().catch(() => {}) }, 60 * 60 * 1000)
    },
  })

  async function buscar() {
    if (hayNueva) { await updateServiceWorker(true); return }
    if (!navigator.onLine) { setAviso('Sin señal: no se puede buscar. Hazlo cuando tengas internet.'); return }
    setBuscando(true); setAviso(null)
    try {
      await registro?.update()
      // si apareció una versión nueva, `hayNueva` cambia y el botón lo dice
      setTimeout(() => setAviso(h => h ?? 'Ya tienes la última versión.'), 1500)
    } catch {
      setAviso('No se pudo buscar. Intenta de nuevo con mejor señal.')
    } finally {
      setTimeout(() => setBuscando(false), 1500)
    }
  }

  async function instalar() {
    if (canInstall) await prompt?.()
    else setInstrucciones(v => !v)
  }

  return (
    <div className="mx-4 mt-3 space-y-2.5">
      {hayNueva && (
        <div className="rounded-2xl bg-ambar/25 border border-ambar/60 px-4 py-3 flex items-center gap-3">
          <ArrowUpCircle size={22} className="text-ambar-oscuro shrink-0" />
          <p className="flex-1 text-sm text-gray-900"><strong>Hay una versión nueva.</strong> Guarda lo que estés llenando y actualiza.</p>
          <button onClick={() => updateServiceWorker(true)} className="boton boton-ambar !min-h-11 !px-4 !text-sm">Actualizar</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        {isInstalled ? (
          <div className="tarjeta px-3 py-2.5 flex items-center justify-center gap-2 text-sm text-emerald-800 font-semibold">
            <CheckCircle2 size={17} /> App instalada
          </div>
        ) : (
          <button onClick={instalar} className="boton boton-bosque !min-h-12 !text-sm"><Download size={17} /> Instalar app</button>
        )}
        <button onClick={buscar} disabled={buscando} className="boton boton-vidrio !min-h-12 !text-sm">
          <RefreshCw size={16} className={buscando ? 'animate-spin' : ''} />
          {hayNueva ? 'Actualizar ahora' : buscando ? 'Buscando…' : 'Buscar actualización'}
        </button>
      </div>
      {aviso && !hayNueva && <p className="text-xs text-gray-600 text-center">{aviso}</p>}

      {instrucciones && !isInstalled && <div className="-mx-4"><InstallBanner forzar /></div>}
    </div>
  )
}
