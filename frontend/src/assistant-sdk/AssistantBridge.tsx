import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { ensureFreshToken, getToken, useAuth } from '@/lib/auth'
import { AssistantCollector } from './collector'
import { loadStableAssistantRuntime } from './assistantLoaderHost'
import type { AssistantSdk } from './types'

/** Forge 宿主适配：通过 stable Loader 启动与外部系统完全一致的 Assistant 运行时。 */
export function AssistantBridge() {
  const location = useLocation()
  const auth = useAuth()
  const collector = useMemo(() => new AssistantCollector({ ignoreUrls: ['/api/assistant/'] }), [])
  const assistantRef = useRef<AssistantSdk | null>(null)
  const latestContextRef = useRef({ authUser: auth.user, location })
  latestContextRef.current = { authUser: auth.user, location }

  useEffect(() => {
    let disposed = false
    collector.start()

    void loadStableAssistantRuntime().then(({ sdk }) => {
      if (disposed) return
      const current = latestContextRef.current
      assistantRef.current = sdk.initialize({
        appId: 'KAI_TOOLBOX',
        appName: 'Forge',
        sourceRevision: 'loader-stable',
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
    }).catch(error => {
      console.error('[assistant-loader] Forge 彩虹胶囊加载失败', error)
    })

    return () => {
      disposed = true
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
