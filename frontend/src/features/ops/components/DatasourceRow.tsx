import { useState } from 'react'
import { Check, Copy, Eye, EyeOff, Pencil, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { getDatasourceConnection } from '../api'
import type { DatasourceView } from '../types'
import { TYPE_META, envBadge } from '../meta'

interface Props {
  d: DatasourceView
  selected: boolean
  testing: boolean
  onOpen: () => void
  onTest: () => void
  onEdit: () => void
}

/** 单个中间件实例行：展示 + 测试/编辑 + 「眼睛」按需显示明文密码。 */
export function DatasourceRow({ d, selected, testing, onOpen, onTest, onEdit }: Props) {
  const [show, setShow] = useState(false)
  const [pwd, setPwd] = useState<string | null | undefined>(undefined) // undefined=未取, null=无密码
  const [user, setUser] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function toggle() {
    if (show) { setShow(false); return }
    if (pwd !== undefined) { setShow(true); return }
    setLoading(true); setErr(null)
    try {
      const c = await getDatasourceConnection(d.id)
      setPwd(c.password ?? null)
      setUser(c.username ?? null)
      setShow(true)
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  async function copyPwd() {
    if (!pwd) return
    try {
      await navigator.clipboard.writeText(pwd)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用时忽略 */ }
  }

  return (
    <div
      className={cn(
        'rounded-md border px-2 py-1.5 text-sm',
        selected ? 'border-[var(--color-ring)] bg-[var(--color-muted)]/40' : 'hover:bg-[var(--color-muted)]/30',
      )}
    >
      <div className="flex items-center gap-2">
        <button
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={onOpen}
          title={d.queryable ? '打开查询控制台' : '该类型暂只登记，不支持在线查询'}
        >
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', envBadge(d.env))}>{d.env}</span>
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', TYPE_META[d.type].badge)}>
            {TYPE_META[d.type].label}
          </span>
          <span className="min-w-0 flex-1 truncate">{d.name}</span>
          <span className="hidden truncate font-mono text-[10px] text-[var(--color-muted-foreground)] sm:inline">
            {d.endpoint}
          </span>
        </button>
        {d.passwordConfigured && (
          <button
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
            title={show ? '隐藏密码' : '显示密码'}
            onClick={toggle}
            disabled={loading}
          >
            {show ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        )}
        <button
          className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] disabled:opacity-50"
          title="测试连接"
          onClick={onTest}
          disabled={testing}
        >
          <Wifi className="size-3.5" />
        </button>
        <button
          className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
          title="编辑"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      {err && <div className="mt-1 text-[11px] text-[var(--color-destructive)]">读取失败：{err}</div>}

      {show && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 pl-1 font-mono text-[11px] text-[var(--color-muted-foreground)]">
          {user && <span>user: <span className="text-[var(--color-foreground)]">{user}</span></span>}
          <span className="flex items-center gap-1">
            pwd:
            <span className="break-all text-[var(--color-foreground)]">{pwd ?? '（无密码）'}</span>
            {pwd && (
              <button className="hover:text-[var(--color-foreground)]" title="复制密码" onClick={copyPwd}>
                {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
