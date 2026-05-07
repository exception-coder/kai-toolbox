import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const DISMISS_KEY = 'pwa-install-dismissed-at'
// 用户点 "稍后" 后的静默期：7 天内不再弹
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

function isStandalone() {
  if (typeof window === 'undefined') return false
  if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  // iOS Safari
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true
}

function recentlyDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    const ts = Number(raw)
    if (!Number.isFinite(ts)) return false
    return Date.now() - ts < DISMISS_TTL_MS
  } catch {
    return false
  }
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isStandalone()) return
    if (recentlyDismissed()) return

    const onBeforeInstall = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => {
      setVisible(false)
      setDeferred(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!visible || !deferred) return null

  const handleInstall = async () => {
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === 'dismissed') {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
      }
    } finally {
      setVisible(false)
      setDeferred(null)
    }
  }

  const handleDismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setVisible(false)
  }

  return (
    <div
      role="dialog"
      aria-label="安装应用"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-lg border bg-[var(--color-background)] p-4 shadow-lg"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="关闭"
        className="absolute right-2 top-2 rounded-md p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
      >
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="rounded-md bg-[var(--color-primary)]/10 p-2 text-[var(--color-primary)]">
          <Download className="size-5" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium">安装 kai-toolbox</div>
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            将本站添加到桌面，下次直接以独立窗口启动。
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={handleInstall}>立即安装</Button>
            <Button size="sm" variant="ghost" onClick={handleDismiss}>稍后再说</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
