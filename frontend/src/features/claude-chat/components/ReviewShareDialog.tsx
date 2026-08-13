import { useMemo, useState } from 'react'
import { Check, Copy, Loader2, Share2, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createReviewShare, type ReviewShareMode } from '../api'
import type { ChatItem, Engine } from '../types'

interface Props {
  open: boolean
  sessionId: string
  sessionTitle?: string | null
  engine: Engine
  sdkSessionId?: string | null
  officialProvider?: boolean
  items: ChatItem[]
  onClose: () => void
}

export function ReviewShareDialog({ open, sessionId, sessionTitle, engine, sdkSessionId, officialProvider = true, items, onClose }: Props) {
  const [mode, setMode] = useState<ReviewShareMode>('SAFE_SNAPSHOT')
  const [days, setDays] = useState(7)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fullForkAvailable = engine === 'codex' && officialProvider && Boolean(sdkSessionId)
  const snapshot = useMemo(() => {
    const relevant = items.filter(item => item.kind === 'user' || item.kind === 'assistant').slice(-24)
    return relevant.map(item => `${item.kind === 'user' ? '用户' : 'AI'}：${item.text ?? ''}`).join('\n\n').slice(-24_000)
  }, [items])
  if (!open) return null

  const create = async () => {
    setBusy(true); setError(null)
    try {
      const anchorItem = [...items].reverse().find(item => item.kind === 'assistant' && Boolean(item.forkAnchor))
      const lastTurnId = anchorItem?.kind === 'assistant' ? anchorItem.forkAnchor : undefined
      const result = await createReviewShare(sessionId, {
        mode,
        title: `${sessionTitle || '开发需求'} · 计划评审`,
        contextSnapshot: snapshot,
        expiresInDays: days,
        lastTurnId,
      })
      setShareUrl(new URL(result.sharePath, window.location.origin).toString())
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally { setBusy(false) }
  }
  const copy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true); window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-xl rounded-2xl border bg-[var(--color-card)] p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-violet-500/10 p-2 text-violet-600"><Share2 className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">分享开发计划评审</h2>
            <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">分享消息进入独立的“评审会话”组，只能评审计划，不会执行编码。</p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-[var(--color-muted)]"><X className="size-4" /></button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <ModeCard active={mode === 'SAFE_SNAPSHOT'} title="安全快照" badge="推荐"
            text="提取最近的需求与方案上下文，新建独立评审线程；不携带开发工具和完整历史。"
            onClick={() => setMode('SAFE_SNAPSHOT')} />
          <ModeCard active={mode === 'FULL_FORK'} disabled={!fullForkAvailable} title="完整上下文"
            badge="Codex App Server" text={fullForkAvailable ? '原生 fork 当前 Codex Thread，再切换到隔离评审目录与只读策略。' : '仅已有原生 Thread 的官方 Codex 会话可用。'}
            onClick={() => fullForkAvailable && setMode('FULL_FORK')} />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border bg-[var(--color-muted)]/45 px-3 py-2">
          <span className="text-sm">链接有效期</span>
          <select value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm">
            <option value={1}>1 天</option><option value={7}>7 天</option><option value={30}>30 天</option><option value={90}>90 天</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">
          <ShieldCheck className="size-4 shrink-0" />服务端固定 review-only：禁止切换权限、访问项目工作区、调用 MCP、执行命令或写入文件。
        </div>
        {error && <p className="mt-3 text-sm text-[var(--color-destructive)]">{error}</p>}
        {shareUrl && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border p-2">
            <input readOnly value={shareUrl} className="min-w-0 flex-1 bg-transparent px-1 text-xs outline-none" />
            <Button size="sm" variant="secondary" onClick={() => void copy()}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? '已复制' : '复制链接'}</Button>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>关闭</Button>
          {!shareUrl && <Button onClick={() => void create()} disabled={busy || (mode === 'FULL_FORK' && !fullForkAvailable)}>{busy && <Loader2 className="size-4 animate-spin" />}创建评审链接</Button>}
        </div>
      </div>
    </div>
  )
}

function ModeCard({ active, disabled, title, badge, text, onClick }: { active: boolean; disabled?: boolean; title: string; badge: string; text: string; onClick: () => void }) {
  return <button type="button" disabled={disabled} onClick={onClick} className={`rounded-xl border p-3 text-left transition ${active ? 'border-violet-500 bg-violet-500/8 ring-1 ring-violet-500/30' : 'hover:bg-[var(--color-muted)]'} disabled:cursor-not-allowed disabled:opacity-45`}>
    <span className="flex items-center justify-between gap-2"><strong className="text-sm">{title}</strong><span className="rounded-full bg-[var(--color-muted)] px-2 py-0.5 text-[10px]">{badge}</span></span>
    <span className="mt-2 block text-xs leading-5 text-[var(--color-muted-foreground)]">{text}</span>
  </button>
}
