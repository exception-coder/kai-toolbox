import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, Loader2, Pencil, Plus, RefreshCw, Search, Server, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { fetchProviderModels } from '../api'
import { groupModels, modelPlatform } from './modelGroups'
import type { ModelInfo } from '../types'
import { loadProfiles, removeProfile, upsertProfile, type ProviderProfile } from '../providerProfiles'

interface Props {
  onClose: () => void
}

type Draft = { id?: string; name: string; baseUrl: string; key: string; model: string }
const EMPTY: Draft = { name: '', baseUrl: '', key: '', model: '' }

/** 第三方网关服务商档案管理：本地存储，供会话切换服务商时复用。 */
export function ProviderProfilesPanel({ onClose }: Props) {
  const confirm = useConfirm()
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => loadProfiles())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState('')

  const startNew = () => { setErr(''); setDraft({ ...EMPTY }) }
  const startEdit = (p: ProviderProfile) => { setErr(''); setDraft({ ...p }) }

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) { setErr('请填写名称'); return }
    if (!draft.baseUrl.trim()) { setErr('请填写 baseURL'); return }
    if (!draft.key.trim()) { setErr('请填写 API Key'); return }
    setProfiles(upsertProfile(draft))
    setDraft(null)
  }

  const del = async (p: ProviderProfile) => {
    const ok = await confirm({
      title: '删除服务商档案',
      description: `删除「${p.name}」？已用它创建的会话不受影响。`,
      confirmText: '删除',
      variant: 'destructive',
    })
    if (!ok) return
    setProfiles(removeProfile(p.id))
  }

  return (
    <div className="max-h-[60vh] overflow-y-auto border-b px-3 py-3 text-sm">
      <div className="mb-2 flex items-center gap-2">
        <Server className="size-4 text-[var(--color-primary)]" />
        <span className="font-medium">服务商（第三方网关）</span>
        <Button variant="outline" size="sm" className="ml-auto gap-1" onClick={startNew}>
          <Plus className="size-4" /> 新增
        </Button>
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]">
          <X className="size-4" />
        </button>
      </div>

      <div className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>仅按会话生效，不影响官方登录。Key 存在本机浏览器（明文），请勿在共享设备使用。</span>
      </div>

      {profiles.length === 0 && !draft && (
        <p className="py-2 text-xs text-[var(--color-muted-foreground)]">还没有服务商档案，点「新增」添加一个。</p>
      )}
      <ul className="space-y-1">
        {profiles.map(p => (
          <li key={p.id} className="flex items-center gap-2 rounded-md border px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{p.name}</div>
              <div className="truncate text-[11px] text-[var(--color-muted-foreground)]">{p.baseUrl} · {p.model || '未设默认模型'}</div>
            </div>
            <button type="button" onClick={() => startEdit(p)} aria-label="编辑" className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">
              <Pencil className="size-4" />
            </button>
            <button type="button" onClick={() => del(p)} aria-label="删除" className="rounded p-1 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="mt-3 space-y-2 rounded-md border bg-[var(--color-muted)] p-2">
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">名称</label>
            <Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="例如 4sapi" className="mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">baseURL（Anthropic 兼容）</label>
            <Input value={draft.baseUrl} onChange={e => setDraft({ ...draft, baseUrl: e.target.value })} placeholder="https://4sapi.com" className="mt-0.5" />
          </div>
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">API Key</label>
            <Input type="password" value={draft.key} onChange={e => setDraft({ ...draft, key: e.target.value })} placeholder="sk-..." className="mt-0.5" />
          </div>
          <ModelField
            baseUrl={draft.baseUrl}
            apiKey={draft.key}
            value={draft.model}
            onChange={model => setDraft({ ...draft, model })}
          />
          {err && <p className="text-xs text-[var(--color-destructive)]">{err}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDraft(null)}>取消</Button>
            <Button size="sm" onClick={save}>保存</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelField({
  baseUrl,
  apiKey,
  value,
  onChange,
}: {
  baseUrl: string
  apiKey: string
  value: string
  onChange: (model: string) => void
}) {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const reqSeq = useRef(0)

  const load = (base: string, key: string) => {
    const trimmed = base.trim()
    if (!trimmed) {
      setModels([])
      setError(null)
      return
    }
    const seq = ++reqSeq.current
    setLoading(true)
    setError(null)
    fetchProviderModels(trimmed, key.trim())
      .then(r => {
        if (seq !== reqSeq.current) return
        const list = r.models ?? []
        setModels(list)
        setError(list.length === 0 ? (r.error ?? '网关未返回模型') : null)
        if (list.length === 0) setManual(true)
      })
      .catch(e => {
        if (seq !== reqSeq.current) return
        setModels([])
        setError(`请求失败：${(e as Error)?.message ?? '未知错误'}`)
        setManual(true)
      })
      .finally(() => {
        if (seq === reqSeq.current) setLoading(false)
      })
  }

  useEffect(() => {
    if (!baseUrl.trim()) {
      setModels([])
      setError(null)
      return
    }
    const timer = setTimeout(() => load(baseUrl, apiKey), 500)
    return () => clearTimeout(timer)
  }, [baseUrl, apiKey])

  const valueMissing = value.trim() !== '' && !models.some(m => m.value === value)
  const dropdownModels = valueMissing ? [{ value, displayName: value, description: '' }, ...models] : models
  const useDropdown = !manual && dropdownModels.length > 0

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-muted-foreground)]">默认模型（新建会话预填，可改）</label>
        {loading && <Loader2 className="size-3 animate-spin text-[var(--color-muted-foreground)]" />}
        <div className="ml-auto flex items-center gap-1">
          {dropdownModels.length > 0 && (
            <button
              type="button"
              onClick={() => setManual(m => !m)}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              title={manual ? '从列表选择' : '手动输入模型名'}
            >
              {manual ? <Server className="size-3" /> : <Pencil className="size-3" />}
              {manual ? '从列表选' : '手动输入'}
            </button>
          )}
          <button
            type="button"
            onClick={() => load(baseUrl, apiKey)}
            disabled={loading || !baseUrl.trim()}
            className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] disabled:opacity-40"
            title="重新加载模型列表"
          >
            <RefreshCw className="size-3" /> 刷新
          </button>
        </div>
      </div>

      {useDropdown ? (
        <ProviderModelDropdown
          models={dropdownModels}
          value={value}
          onChange={onChange}
          onRefresh={() => load(baseUrl, apiKey)}
          loading={loading}
        />
      ) : (
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="网关挂的模型名，如 claude-sonnet-4-5"
          className="mt-0.5"
        />
      )}

      {error && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          {error}，已切到手动输入。填好 baseURL/Key 后点「刷新」重试。
        </p>
      )}
    </div>
  )
}

function ProviderModelDropdown({
  models,
  value,
  onChange,
  onRefresh,
  loading,
}: {
  models: ModelInfo[]
  value: string
  onChange: (model: string) => void
  onRefresh: () => void
  loading: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return models
    return models.filter(m =>
      m.value.toLowerCase().includes(kw)
      || (m.displayName ?? '').toLowerCase().includes(kw)
      || (m.description ?? '').toLowerCase().includes(kw),
    )
  }, [models, q])
  const groups = groupModels(filtered)
  const selected = models.find(m => m.value === value)
  const label = selected?.displayName || selected?.value || value || '选择模型'

  const pick = (model: string) => {
    onChange(model)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={rootRef} className="relative mt-0.5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]"
      >
        <span className={cn('size-2 shrink-0 rounded-full', modelDot(value))} />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {loading ? <Loader2 className="size-3.5 shrink-0 animate-spin opacity-60" /> : <ChevronDown className="size-3.5 shrink-0 opacity-60" />}
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-full min-w-80 overflow-hidden rounded-lg border bg-[var(--color-background)] shadow-lg">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索模型..."
              className="h-6 min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none"
            />
            <button
              type="button"
              onClick={onRefresh}
              title="刷新模型列表"
              className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          </div>
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <span className="mr-1 text-[11px] text-[var(--color-muted-foreground)]">排序</span>
            <span className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary-foreground)]">平台</span>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">无匹配模型</p>
            )}
            {groups.map(g => (
              <div key={g.key} className="mb-1">
                <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">{g.label}</div>
                {g.models.map(m => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => pick(m.value)}
                    title={m.description || m.value}
                    className={cn(
                      'block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]',
                      m.value === value && 'bg-[var(--color-accent)]/60',
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn('mt-1 size-2 shrink-0 rounded-full', modelDot(m.value))} />
                      <span className="min-w-0 flex-1 wrap-anywhere">{m.displayName || m.value}</span>
                      {m.value === value && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-primary)]" />}
                    </div>
                    {m.displayName && m.displayName !== m.value && (
                      <div className="pl-4 text-[10px] text-[var(--color-muted-foreground)]">{m.value}</div>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function modelDot(id: string): string {
  const tones: Record<string, string> = {
    openai: 'bg-emerald-500',
    anthropic: 'bg-orange-500',
    google: 'bg-blue-500',
    deepseek: 'bg-indigo-500',
    qwen: 'bg-violet-500',
    zhipu: 'bg-cyan-500',
    moonshot: 'bg-slate-500',
    xai: 'bg-neutral-700 dark:bg-neutral-300',
    doubao: 'bg-rose-500',
    meta: 'bg-sky-500',
    mistral: 'bg-amber-500',
    yi: 'bg-teal-500',
    baidu: 'bg-red-500',
    other: 'bg-gray-400',
  }
  return tones[modelPlatform(id).key] ?? tones.other
}
