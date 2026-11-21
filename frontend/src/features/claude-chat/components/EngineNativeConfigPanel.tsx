import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { applyEngineNativeConfig, getEngineNativeConfig, type EngineNativeConfig, type EngineNativeConfigApplyInput } from '../api'

type Provider = EngineNativeConfigApplyInput['provider']
const DEEPSEEK_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash']
const QUERY_KEY = ['engine-native-config']

function hostOf(url: string | null): string | undefined {
  try { return url ? new URL(url).host : undefined } catch { return undefined }
}

/** 一行说清当前用的是谁家的什么模型，Key 只给末 4 位。 */
export function describeEngineConfig(config: EngineNativeConfig): string {
  if (!config.configured) return config.model ? `模型 ${config.model}，未配置 Key` : '未配置'
  const provider = config.provider === 'deepseek' ? 'DeepSeek'
    : config.provider === 'openai-compatible' ? (hostOf(config.baseUrl) ?? 'OpenAI 兼容') : config.provider
  return [provider, config.model, config.keyHint && `Key ${config.keyHint}`].filter(Boolean).join(' · ')
}

/** 把同一个第三方 Key 快速写进各开源引擎的本机原生配置；Key 不回传浏览器，留空沿用已有 Key。 */
export function EngineNativeConfigPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const isAdmin = !!user?.roles?.includes('ADMIN')
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: getEngineNativeConfig, enabled: isAdmin })
  const [provider, setProvider] = useState<Provider>('deepseek')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState(DEEPSEEK_MODELS[0])
  const [apiKey, setApiKey] = useState('')
  const [selected, setSelected] = useState<Set<string> | null>(null)
  const engines = useMemo(() => query.data ?? [], [query.data])
  const supported = (config: EngineNativeConfig) => provider === 'deepseek' || config.supportsCustom

  // 首次加载默认全选；切换服务商时去掉不支持的引擎。
  useEffect(() => {
    if (!engines.length) return
    setSelected(previous => new Set((previous ? engines.filter(config => previous.has(config.engine)) : engines)
      .filter(supported).map(config => config.engine)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engines, provider])

  const mutation = useMutation({
    mutationFn: applyEngineNativeConfig,
    onSuccess: result => {
      queryClient.setQueryData(QUERY_KEY, result.engines)
      setApiKey('')
    },
  })
  const chosen = engines.filter(config => selected?.has(config.engine) && supported(config))
  const canApply = chosen.length > 0 && model.trim() && (provider === 'deepseek' || baseUrl.trim()) && !mutation.isPending

  const toggle = (engine: string) => setSelected(previous => {
    const next = new Set(previous)
    if (next.has(engine)) next.delete(engine)
    else next.add(engine)
    return next
  })

  const switchProvider = (next: Provider) => {
    setProvider(next)
    setModel(next === 'deepseek' ? DEEPSEEK_MODELS[0] : '')
    mutation.reset()
  }

  const apply = () => mutation.mutate({
    engines: chosen.map(config => config.engine),
    provider,
    model: model.trim(),
    ...(provider === 'openai-compatible' ? { baseUrl: baseUrl.trim() } : {}),
    ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
  })

  return (
    <div className="border-b bg-[var(--color-muted)]/30 px-3 py-3">
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-medium">引擎配置</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
            把第三方模型 Key 写入开源引擎的本机配置，对这台机器上的所有会话生效。会话级的临时切换仍用「服务商」。
          </p>
        </div>
        {isAdmin && <Button variant="ghost" size="icon" className="size-8" aria-label="刷新引擎配置"
          onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className={cn('size-4', query.isFetching && 'animate-spin')} />
        </Button>}
        <Button variant="ghost" size="icon" className="size-8" aria-label="关闭引擎配置" onClick={onClose}><X className="size-4" /></Button>
      </div>

      {!isAdmin ? (
        <p className="rounded-md border px-2 py-1.5 text-xs text-[var(--color-muted-foreground)]">
          引擎配置会改动运行 Forge 的机器上的本机文件，仅管理员可查看和修改。需要调整时请联系管理员，或在会话中用「服务商」临时切换。
        </p>
      ) : query.isError ? (
        <div role="alert" className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs">
          <span className="flex-1 text-[var(--color-destructive)]">读取引擎配置失败：{(query.error as Error).message}</span>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>重试</Button>
        </div>
      ) : (
        <div className="rounded-md border text-xs">
          <ul aria-label="引擎当前配置" className="divide-y">
            {query.isLoading && <li className="px-2 py-2 text-[var(--color-muted-foreground)]">正在读取本机配置…</li>}
            {engines.map(config => {
              const enabled = supported(config)
              return <li key={config.engine}>
                <label className={cn('flex min-h-10 cursor-pointer items-start gap-2 px-2 py-1.5', !enabled && 'cursor-not-allowed opacity-60')}>
                  <input type="checkbox" className="mt-0.5" checked={enabled && !!selected?.has(config.engine)}
                    disabled={!enabled} onChange={() => toggle(config.engine)} aria-label={`应用到 ${config.label}`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-medium">{config.label}</span>
                      <span className={config.configured ? 'text-[var(--color-foreground)]' : 'text-amber-700 dark:text-amber-300'}>
                        {describeEngineConfig(config)}
                      </span>
                    </span>
                    <span className="mt-0.5 block break-all text-[var(--color-muted-foreground)]">
                      {!enabled ? '仅支持 DeepSeek' : `修改后${config.takesEffect}生效`}
                      {config.note && ` · ${config.note}`}
                    </span>
                  </span>
                </label>
              </li>
            })}
          </ul>

          <div className="space-y-2 border-t px-2 py-2">
            <div role="radiogroup" aria-label="服务商" className="flex gap-1">
              {([['deepseek', 'DeepSeek'], ['openai-compatible', 'OpenAI 兼容服务']] as const).map(([value, label]) => (
                <button key={value} type="button" role="radio" aria-checked={provider === value} onClick={() => switchProvider(value)}
                  className={cn('min-h-8 rounded-md border px-2.5', provider === value
                    ? 'border-[var(--color-foreground)] font-medium' : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]')}>
                  {label}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {provider === 'openai-compatible' && (
                <label className="space-y-1 sm:col-span-2">
                  <span className="text-[var(--color-muted-foreground)]">服务地址</span>
                  <Input value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://example.com/v1" inputMode="url" />
                </label>
              )}
              <label className="space-y-1">
                <span className="text-[var(--color-muted-foreground)]">模型 ID</span>
                <Input value={model} onChange={event => setModel(event.target.value)} list="engine-native-models"
                  placeholder={provider === 'deepseek' ? 'deepseek-v4-pro' : '服务商提供的模型 ID'} />
                {provider === 'deepseek' && <datalist id="engine-native-models">
                  {DEEPSEEK_MODELS.map(item => <option key={item} value={item} />)}
                </datalist>}
              </label>
              <label className="space-y-1">
                <span className="text-[var(--color-muted-foreground)]">API Key</span>
                <Input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password"
                  placeholder="留空则沿用同一服务已有的 Key" />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={apply} disabled={!canApply}>
                {mutation.isPending ? '正在写入…' : `应用到所选引擎（${chosen.length}）`}
              </Button>
              <span className="text-[var(--color-muted-foreground)]">首次改动会在原文件旁保留 .forge-bak 备份</span>
            </div>
            {mutation.isError && <p role="alert" className="text-[var(--color-destructive)]">写入失败：{(mutation.error as Error).message}</p>}
            {mutation.data && (
              <div role="status" className="space-y-0.5">
                {mutation.data.applied.length > 0 && <p className="text-emerald-700 dark:text-emerald-400">
                  已更新 {mutation.data.applied.length} 个引擎，按各自提示的时机生效。
                </p>}
                {mutation.data.failures.map(failure => <p key={failure} className="text-[var(--color-destructive)]">{failure}</p>)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
