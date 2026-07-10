import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Keyboard, Loader2, Pencil, Plus, RefreshCw, Server, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { fetchProviderModels } from '../api'
import { groupModels } from './modelGroups'
import type { ModelInfo } from '../types'
import { loadProfiles, removeProfile, upsertProfile, type ProviderProfile } from '../providerProfiles'

interface Props {
  onClose: () => void
}

type Draft = { id?: string; name: string; baseUrl: string; key: string; model: string }
const EMPTY: Draft = { name: '', baseUrl: '', key: '', model: '' }

/**
 * 第三方网关「服务商档案」管理：本地（localStorage）CRUD。仅 Claude 引擎用，按会话生效，不污染官方。
 * Key 本地明文存储——单机单用户工具，面板内已提示。
 */
export function ProviderProfilesPanel({ onClose }: Props) {
  const confirm = useConfirm()
  const [profiles, setProfiles] = useState<ProviderProfile[]>(() => loadProfiles())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [err, setErr] = useState('')

  const startNew = () => { setErr(''); setDraft({ ...EMPTY }) }
  const startEdit = (p: ProviderProfile) => { setErr(''); setDraft({ ...p }) }

  const save = () => {
    if (!draft) return
    if (!draft.name.trim()) { setErr('请填名称'); return }
    if (!draft.baseUrl.trim()) { setErr('请填 baseURL'); return }
    if (!draft.key.trim()) { setErr('请填 API Key'); return }
    setProfiles(upsertProfile(draft))
    setDraft(null)
  }

  const del = async (p: ProviderProfile) => {
    const ok = await confirm({ title: '删除服务商档案', description: `删除「${p.name}」？已用它创建的会话不受影响。`, confirmText: '删除', variant: 'destructive' })
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
        <span>仅 Claude 引擎、按会话生效，不影响你的官方登录。Key 存在本机浏览器（明文），请勿在共享设备使用。</span>
      </div>

      {/* 档案列表 */}
      {profiles.length === 0 && !draft && (
        <p className="py-2 text-xs text-[var(--color-muted-foreground)]">还没有服务商档案，点「新增」添加一个（如 4sapi）。</p>
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

      {/* 编辑/新增表单：默认模型见 ModelField（接口加载下拉 + 手动兜底） */}
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

/**
 * 「默认模型」选择：用该档案自己的 baseURL + Key 调后端代理 `POST /provider/models`
 * 拉网关 `/v1/models`，按平台分组成下拉（参考 AI 对话的接口加载选择）。
 * baseURL/Key 齐全后自动加载（去抖 500ms，避免逐字符输 Key 时狂拉）；失败或网关不给列表时
 * 自动降级为手动输入，另留「手动输入」开关随时手填未在列表里的模型名。
 */
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
        if (seq !== reqSeq.current) return // 已被更新的请求取代
        const list = r.models ?? []
        setModels(list)
        setError(list.length === 0 ? (r.error ?? '网关未返回模型') : null)
        if (list.length === 0) setManual(true) // 拉不到 → 退回手输
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

  // baseURL/Key 变化后去抖自动加载（编辑已存在档案时也会自动首拉）。
  useEffect(() => {
    if (!baseUrl.trim()) {
      setModels([])
      setError(null)
      return
    }
    const t = setTimeout(() => load(baseUrl, apiKey), 500)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseUrl, apiKey])

  const groups = groupModels(models)
  // 当前值不在拉到的列表里（如网关新模型/历史手填），补一个选项以免显示成空。
  const valueMissing = value.trim() !== '' && !models.some(m => m.value === value)
  const useSelect = !manual && models.length > 0

  return (
    <div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--color-muted-foreground)]">默认模型（新建会话预填，可改）</label>
        {loading && <Loader2 className="size-3 animate-spin text-[var(--color-muted-foreground)]" />}
        <div className="ml-auto flex items-center gap-1">
          {models.length > 0 && (
            <button
              type="button"
              onClick={() => setManual(m => !m)}
              className="flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              title={manual ? '从列表选择' : '手动输入模型名'}
            >
              {manual ? <Server className="size-3" /> : <Keyboard className="size-3" />}
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

      {useSelect ? (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="mt-0.5 w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
        >
          <option value="">（不设默认，新建时再选）</option>
          {valueMissing && <option value={value}>{value}（当前，不在列表）</option>}
          {groups.map(g => (
            <optgroup key={g.key} label={g.label}>
              {g.models.map(m => (
                <option key={m.value} value={m.value}>
                  {m.displayName && m.displayName !== m.value ? `${m.displayName}（${m.value}）` : m.value}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
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
          {error}，已切手动输入。填好 baseURL/Key 后点「刷新」重试。
        </p>
      )}
    </div>
  )
}
