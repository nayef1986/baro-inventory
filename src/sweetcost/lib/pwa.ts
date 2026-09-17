// ============================================================
// pwa.ts — التثبيت على الجوال
// ============================================================

import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/** يسجّل الـService Worker في الإنتاج فقط — في التطوير يعيق التحديث الفوري. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sweet-cost/sw.js', { scope: '/sweet-cost/' }).catch(() => {
      // فشل التسجيل لا يمنع التطبيق من العمل
    })
  })
}

export type InstallState =
  | 'installed' // يعمل الآن كتطبيق مثبّت
  | 'prompt' // المتصفح يدعم التثبيت بضغطة
  | 'ios' // iOS: التثبيت يدوي عبر قائمة المشاركة
  | 'unavailable'

export function useInstall(): { state: InstallState; install: () => Promise<void> } {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
    if (window.matchMedia('(display-mode: standalone)').matches || iosStandalone) {
      setInstalled(true)
    }

    const onPrompt = (event: Event) => {
      event.preventDefault()
      setDeferred(event as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const state: InstallState = installed
    ? 'installed'
    : deferred
      ? 'prompt'
      : isIOS
        ? 'ios'
        : 'unavailable'

  async function install(): Promise<void> {
    if (!deferred) return
    await deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
  }

  return { state, install }
}
