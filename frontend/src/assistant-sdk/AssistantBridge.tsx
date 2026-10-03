import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Bot } from 'lucide-react'
import { ensureFreshToken, getToken, useAuth } from '@/lib/auth'
import { AssistantCollector } from './collector'
import { loadStableAssistantRuntime } from './assistantLoaderHost'
import type { AssistantSdk } from './types'

/** Forge 宿主适配：开发模式支持源码热更新，打包模式消费 stable Loader。 */
export function AssistantBridge() {
  const location = useLocation()
  const auth = useAuth()
  const collector = useMemo(() => new AssistantCollector({ ignoreUrls: ['/api/assistant/'] }), [])
  const assistantRef = useRef<AssistantSdk | null>(null)
  const latestContextRef = useRef({ authUser: auth.user, location })
  latestContextRef.current = { authUser: auth.user, location }

  useEffect(() => {
    let disposed = false
    let loading = false
    let pendingOpen = false
    collector.start()
    const report = (status: string) => window.dispatchEvent(new CustomEvent('kai-assistant-host-status', { detail: status }))
    const load = () => {
      if (loading || disposed) return
      loading = true
      report('loading')
      const runtime = import.meta.env.DEV
        ? import('./assistantSdk').then(module => ({ sdk: { initialize: module.initializeAssistant } }))
        : loadStableAssistantRuntime()
      void runtime.then(({ sdk }) => {
      if (disposed) return
      const current = latestContextRef.current
      assistantRef.current = sdk.initialize({
        appId: 'KAI_TOOLBOX',
        appName: 'Forge',
        projectKey: 'kai-toolbox',
        sourceRevision: import.meta.env.DEV ? 'workspace-dev' : 'loader-stable',
        visibility: { storageKey: 'kai-assistant:visibility:forge' },
        wsUrl: '/api/claude-chat/consult/ws',
        getAccessToken: async () => {
          await ensureFreshToken()
          return getToken() ?? undefined
        },
        user: current.authUser ? {
          id: String(current.authUser.userId),
          displayName: current.authUser.username,
          roles: current.authUser.roles,
        } : undefined,
        page: {
          url: current.location.pathname + current.location.search,
          title: document.title,
        },
        providers: [{
          id: 'runtime-evidence',
          collect: async () => ({ key: 'runtimeEvidence', value: collector.diagnosticWindow() }),
        }],
      })
      report('ready')
      if (pendingOpen) { pendingOpen = false; assistantRef.current.open('AUTO') }
    }).catch(error => {
      if (disposed) return
      report('error')
      console.error('[assistant-loader] Forge 彩虹胶囊加载失败', error)
    }).finally(() => { loading = false })
    }
    const restore = () => {
      if (assistantRef.current) { assistantRef.current.open('AUTO'); report('ready') }
      else { pendingOpen = true; load() }
    }
    window.addEventListener('kai-assistant-host-open', restore)
    load()

    return () => {
      disposed = true
      window.removeEventListener('kai-assistant-host-open', restore)
      collector.stop()
      assistantRef.current?.destroy()
      assistantRef.current = null
    }
  }, [collector])

  useEffect(() => {
    assistantRef.current?.updateContext({
      user: auth.user ? {
        id: String(auth.user.userId),
        displayName: auth.user.username,
        roles: auth.user.roles,
      } : undefined,
      page: {
        url: location.pathname + location.search,
        title: document.title,
      },
      businessObject: undefined,
    })
  }, [auth.user, location.pathname, location.search])

  return null
}

/** 所有触屏宿主恢复均复用 Bridge 中的同一 SDK 实例。 */
export function AssistantRestoreMenuItem() {
  const [status, setStatus] = useState('idle')
  useEffect(() => {
    const update = (event: Event) => setStatus((event as CustomEvent<string>).detail)
    window.addEventListener('kai-assistant-host-status', update)
    return () => window.removeEventListener('kai-assistant-host-status', update)
  }, [])
  return <button type="button" disabled={status === 'loading'}
    className="flex w-full items-center gap-2 py-2 pl-9 pr-3 text-left hover:bg-[var(--color-muted)] disabled:opacity-60"
    onClick={() => { setStatus('loading'); window.dispatchEvent(new Event('kai-assistant-host-open')) }}>
    <span className="shrink-0 text-[var(--color-muted-foreground)]" aria-hidden="true"><Bot className="size-4" /></span>
    <span className="min-w-0 flex-1 text-sm">{status === 'loading' ? '正在加载助手…' : status === 'error' ? '助手暂不可用，点击重试' : '显示助手'}</span>
  </button>
}
