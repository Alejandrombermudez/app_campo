import { useState } from 'react'
import { Download, Share, X, MoreVertical } from 'lucide-react'
import { useInstallPrompt } from '../../lib/useInstallPrompt'

export function InstallBanner() {
  const { platform, canInstall, isInstalled, prompt } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem('ae_install_dismissed') === '1'
  )

  function dismiss() {
    localStorage.setItem('ae_install_dismissed', '1')
    setDismissed(true)
  }

  // Ya instalada o ya descartada → no mostrar nada
  if (isInstalled || dismissed) return null

  // Android con prompt nativo
  if (canInstall) {
    return (
      <div className="mx-4 mt-3 bg-[#0d7377] text-white rounded-2xl p-4 flex items-start gap-3 shadow-md">
        <Download size={20} className="flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-sm">Instalar app en tu dispositivo</p>
          <p className="text-xs opacity-80 mt-0.5">
            Funciona sin internet. Instálala para un acceso rápido desde tu pantalla de inicio.
          </p>
          <button
            onClick={() => prompt?.()}
            className="mt-2 bg-white text-[#0d7377] text-xs font-bold px-4 py-1.5 rounded-lg"
          >
            Instalar
          </button>
        </div>
        <button onClick={dismiss} className="opacity-60">
          <X size={16} />
        </button>
      </div>
    )
  }

  // iOS Safari — instrucciones manuales
  if (platform === 'ios') {
    return (
      <div className="mx-4 mt-3 bg-[#0d7377] text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-start gap-3">
          <Download size={20} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Instalar en iPhone / iPad</p>
            <p className="text-xs opacity-80 mt-1">Para usar sin internet y tener acceso rápido:</p>
            <ol className="text-xs mt-2 space-y-1.5">
              <li className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                Toca el botón <Share size={12} className="inline mx-0.5" /> <span className="font-semibold">"Compartir"</span> en Safari
              </li>
              <li className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                Selecciona <span className="font-semibold">"Agregar a pantalla de inicio"</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0">3</span>
                Toca <span className="font-semibold">"Agregar"</span> en la esquina superior derecha
              </li>
            </ol>
          </div>
          <button onClick={dismiss} className="opacity-60 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  // Android sin prompt (Chrome, Samsung Browser, etc.)
  if (platform === 'android') {
    return (
      <div className="mx-4 mt-3 bg-[#0d7377] text-white rounded-2xl p-4 shadow-md">
        <div className="flex items-start gap-3">
          <Download size={20} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-sm">Instalar en Android</p>
            <ol className="text-xs mt-2 space-y-1.5 opacity-90">
              <li className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0">1</span>
                Toca <MoreVertical size={11} className="inline" /> el menú de Chrome (⋮)
              </li>
              <li className="flex items-center gap-2">
                <span className="bg-white/20 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold flex-shrink-0">2</span>
                Selecciona <span className="font-semibold">"Agregar a pantalla de inicio"</span>
              </li>
            </ol>
          </div>
          <button onClick={dismiss} className="opacity-60 flex-shrink-0">
            <X size={16} />
          </button>
        </div>
      </div>
    )
  }

  // Desktop — no mostrar banner de instalación
  return null
}
