import { useEffect, useState } from 'react'
import { fetchProviderModels } from '../api'
import { supportsSessionProvider } from '../lib/engineCatalog'
import type { ProviderProfile } from '../providerProfiles'
import type { Engine, ModelInfo } from '../types'

/**
 * 新建会话选中第三方网关时，从其 /v1/models 拉可选模型目录（后端代理）。失败/空回退手填，不阻断新建。
 * 从 ChatPage 拆出，行为与原实现一致。
 */
export function useProviderModels({ enabled, engine, providerId, providers }: {
  enabled: boolean; engine: Engine; providerId: string; providers: ProviderProfile[]
}) {
  const [providerModels, setProviderModels] = useState<ModelInfo[]>([])
  const [providerModelsLoading, setProviderModelsLoading] = useState(false)
  const [providerModelsError, setProviderModelsError] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled) return
    if (!supportsSessionProvider(engine) || providerId === '') {
      setProviderModels(current => current.length === 0 ? current : [])
      return
    }
    const p = providers.find(x => x.id === providerId)
    if (!p) { setProviderModels(current => current.length === 0 ? current : []); return }
    let cancelled = false
    setProviderModelsLoading(true)
    setProviderModelsError(null)
    fetchProviderModels({ profileId: p.id })
      .then(r => {
        if (cancelled) return
        setProviderModels(r.models ?? [])
        setProviderModelsError((r.models?.length ?? 0) === 0 ? (r.error ?? '网关未返回模型') : null)
      })
      .catch(e => { if (!cancelled) { setProviderModels([]); setProviderModelsError(`请求失败：${(e as Error)?.message ?? '未知错误'}`) } })
      .finally(() => { if (!cancelled) setProviderModelsLoading(false) })
    return () => { cancelled = true }
  }, [enabled, engine, providerId, providers])
  return { providerModels, providerModelsLoading, providerModelsError, setProviderModelsError }
}
