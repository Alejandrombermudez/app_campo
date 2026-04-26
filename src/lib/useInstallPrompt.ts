import { useEffect, useState } from 'react'

type Platform = 'android' | 'ios' | 'desktop' | 'already-installed'

interface InstallState {
  platform: Platform
  canInstall: boolean   // true si hay prompt nativo (Android/desktop)
  isInstalled: boolean
  prompt: (() => Promise<void>) | null
}

// Detecta iOS Safari
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream
}
// Detecta Android
function isAndroid() {
  return /android/i.test(navigator.userAgent)
}

export function useInstallPrompt(): InstallState {
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => Promise<void> } | null>(null)
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as Event & { prompt: () => Promise<void> })
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const platform: Platform = isInstalled
    ? 'already-installed'
    : isIOS()
      ? 'ios'
      : isAndroid()
        ? 'android'
        : 'desktop'

  async function prompt() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    setDeferredPrompt(null)
  }

  return {
    platform,
    isInstalled,
    canInstall: !!deferredPrompt,
    prompt,
  }
}
