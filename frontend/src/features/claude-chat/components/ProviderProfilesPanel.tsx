import { useState } from 'react'
import { AlertTriangle, Pencil, Plus, Server, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
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

      {/* 编辑/新增表单 */}
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
          <div>
            <label className="text-xs text-[var(--color-muted-foreground)]">默认模型（新建会话预填，可改）</label>
            <Input value={draft.model} onChange={e => setDraft({ ...draft, model: e.target.value })} placeholder="网关挂的模型名，如 claude-sonnet-4-5" className="mt-0.5" />
          </div>
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
