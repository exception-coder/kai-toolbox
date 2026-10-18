import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useIsMutating } from '@tanstack/react-query'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Button } from '@/components/ui/button'
import { useChatRuntime } from '@/features/claude-chat/public-api/runtime'

const VERSION_PATTERN = /^[a-f0-9]{24}$/
const POLL_MS = 15_000
const IDLE_MS = 30_000
const reloadPage = () => window.location.reload()

export async function latestFrontendVersion(): Promise<string | null> {
  const response = await fetch('/__forge_frontend/status', { cache: 'no-store', signal: AbortSignal.timeout(3000) })
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null
  const body = await response.json() as { ready?: boolean; version?: unknown }
  return body.ready && typeof body.version === 'string' && VERSION_PATTERN.test(body.version) ? body.version : null
}

/** A conservative allow-list: only a pristine home page with no activated chat engine may reload automatically. */
export function canRefreshHome(pathname: string, active: boolean, mutations: number): boolean {
  if (pathname !== '/' || active || mutations > 0 || document.visibilityState !== 'visible') return false
  if (document.querySelector('[role="dialog"], [aria-busy="true"], [data-frontend-update-blocked="true"]')) return false
  if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return false
  return !Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
    .some(field => field.type === 'file' ? (field as HTMLInputElement).files?.length : field.value.length > 0)
    && !Array.from(document.querySelectorAll('[contenteditable="true"]')).some(field => field.textContent?.trim())
}

function usePublishedVersion(current: string | null) {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!current) return
    let stopped = false, checking = false
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return
      checking = true
      try {
        const next = await latestFrontendVersion()
        if (!stopped && next) setVersion(next === current ? null : next)
      } catch { /* Offline checks must not disturb the running page. */ }
      finally { checking = false }
    }
    const timer = window.setInterval(() => void check(), POLL_MS)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    void check()
    return () => {
      stopped = true; window.clearInterval(timer)
      document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check)
    }
  }, [current])
  return version
}

export function FrontendUpdateNotice({ reload = reloadPage }: { reload?: () => void }) {
  const current = document.querySelector('meta[name="forge-frontend-version"]')?.getAttribute('content') ?? null
  const version = usePublishedVersion(current && VERSION_PATTERN.test(current) ? current : null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const lastInput = useRef(Date.now())
  const reloading = useRef(false)
  const refreshButton = useRef<HTMLButtonElement | null>(null)
  const { pathname } = useLocation()
  const { active } = useChatRuntime()
  const mutations = useIsMutating()
  const confirm = useConfirm()
  useEffect(() => {
    const touch = () => { lastInput.current = Date.now() }
    const events = ['pointerdown', 'keydown', 'input', 'compositionstart']
    events.forEach(event => document.addEventListener(event, touch, true))
    return () => events.forEach(event => document.removeEventListener(event, touch, true))
  }, [])
  useEffect(() => {
    if (!version || dismissed === version) return
    const timer = window.setInterval(() => {
      if (!reloading.current && Date.now() - lastInput.current >= IDLE_MS && canRefreshHome(pathname, active, mutations)) {
        reloading.current = true; reload()
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [version, dismissed, pathname, active, mutations, reload])
  if (!version || version === dismissed) return null
  const refresh = async () => {
    setBusy(true); setError(null)
    try {
      if (!canRefreshHome(pathname, active, mutations) && !await confirm({ title: '刷新使用新版',
        returnFocusRef: refreshButton,
        description: '刷新会重新加载页面。请先保存输入、等待上传或生成结束；刷新不会停止服务器上已经开始的任务。',
        confirmText: '已保存，刷新', cancelText: '继续当前页面' })) return
      if (!await latestFrontendVersion()) { setError('连接暂不可用，请稍后再试。'); return }
      reloading.current = true; reload()
    } catch { setError('连接暂不可用，请稍后再试。') }
    finally { setBusy(false) }
  }
  return <aside role="status" aria-label="页面更新" className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-lg flex-wrap items-center gap-2 rounded-lg border bg-[var(--color-background)] px-4 py-3 text-sm shadow-sm">
    <span className="min-w-0 flex-1">{error ?? '新版已就绪，可保存当前输入后刷新。'}</span>
    <Button ref={refreshButton} size="sm" disabled={busy} onClick={() => void refresh()}>刷新使用新版</Button>
    <Button size="sm" variant="ghost" onClick={() => setDismissed(version)}>稍后</Button>
  </aside>
}
