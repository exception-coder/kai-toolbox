import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Clock, Send, Square, X } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { QueuedMessage } from '../hooks/useClaudeChatSocket'
import { cn } from '@/lib/utils'

/**
 * 待发送队列：回答执行中排队的消息，本轮结束后按序自动发出。
 * 桌面输入区与移动端详情抽屉共用，可逐条移除或一键清空。空队列不渲染。
 */
export function QueuedList({ items, pausedReason, canSendNow, onSendNow, onRemove, onStop, onClear, className, compact = false }: {
  items: QueuedMessage[]
  pausedReason?: string | null
  canSendNow?: boolean
  onSendNow: (id: string) => void
  onRemove: (id: string) => void
  onStop?: (id: string) => void
  onClear: () => void
  className?: string
  compact?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const actionPending = useRef(false)
  const perform = async (action: () => void) => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    try { await action() } finally { actionPending.current = false; setBusy(false) }
  }
  if (items.length === 0) return null
  return (
    <div className={cn('border-b border-[var(--color-border)] px-3 py-2', className)}>
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
        {!compact && (pausedReason ? <AlertTriangle className="size-3 text-amber-600" /> : <Clock className="size-3" />)}
        {!compact && <span className={cn('min-w-0 flex-1 wrap-anywhere', pausedReason && 'text-amber-700 dark:text-amber-300')}>
          {pausedReason ?? `待发送 ${items.length} 条（本轮正常结束后按序自动发）`}
        </span>}
        {compact ? <QueueClearMenu items={items} onClear={() => { void perform(onClear) }} busy={busy} /> : <button type="button" disabled={busy} onClick={() => { void perform(onClear) }} className="ml-auto shrink-0 rounded px-1.5 py-0.5 hover:bg-[var(--color-accent)] max-md:min-h-11">
          全部清除
        </button>}
      </div>
      {busy && <p role="status" className="text-xs text-[var(--color-muted-foreground)]">正在处理队列…</p>}
      <div className={cn('flex flex-col gap-1 pr-1', !compact && 'max-h-32 overflow-y-auto')}>
        {items.map((q, i) => (
          <div key={q.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-background)] px-2.5 py-1.5 text-sm">
            <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-muted-foreground)]">{i + 1}</span>
            <div className="min-w-0 flex-1 basis-40">
              <span className="block truncate" title={q.text}>{q.text || '（仅附件）'}</span>
              <span className="block wrap-anywhere text-xs text-[var(--color-muted-foreground)]">{queueDeliveryLabel(q.deliveryState)}{q.deliveryNote ? ` · ${q.deliveryNote}` : ''}</span>
              {q.attachments && q.attachments.length > 0 && (
                <span className="ml-1 text-xs text-[var(--color-muted-foreground)]">+{q.attachments.length} 附件</span>
              )}
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1">
            {i === 0 && onStop && q.deliveryState && q.deliveryState !== 'CANCELLED' && (
              <button type="button" disabled={busy} onClick={() => { void perform(() => onStop(q.id)) }} title="终止当前任务和自动追问，保留其余消息"
                className="inline-flex min-h-11 items-center gap-1 rounded px-2 text-xs text-[var(--color-destructive)] hover:bg-[var(--color-accent)]">
                <Square className="size-3" />终止询问
              </button>
            )}
            {i === 0 && (canSendNow || ['BLOCKED', 'UNKNOWN', 'FAILED', 'CANCELLED'].includes(q.deliveryState ?? '')) && !['ACCEPTED', 'DISPATCHING', 'CHECKING'].includes(q.deliveryState ?? '') && (
              <button
                type="button"
                onClick={() => { void perform(() => onSendNow(q.id)) }}
                disabled={busy || (q.deliveryState === 'CANCELLED' && !canSendNow)}
                title={q.deliveryState ? '确认当前任务已处理完成，再继续队列' : '立即发送这条消息'}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-xs text-[var(--color-primary)] hover:bg-[var(--color-accent)] max-md:min-h-10"
              >
                <Send className="size-3" />{q.deliveryState && q.deliveryState !== 'CANCELLED' ? '已核对，继续队列' : '发送'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { void perform(() => onRemove(q.id)) }}
              disabled={busy}
              aria-label="移除"
              title={q.deliveryState && q.deliveryState !== 'CANCELLED' ? '终止当前询问并删除此项，其余消息保留' : '删除此队列消息'}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded px-2 text-xs text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-destructive)]"
            >
              <X className="size-3.5" />删除
            </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function queueDeliveryLabel(state?: string) {
  if (!state) return '待发送'
  if (state === 'DISPATCHING') return '发送中'
  if (state === 'ACCEPTED') return '已接收 · 执行中'
  if (state === 'FAILED') return '发送或执行失败 · 请核对'
  if (state === 'BLOCKED') return '队列已暂停 · 待核对'
  if (state === 'CANCELLED') return '自动追问已终止 · 待手动发送'
  return '派发结果待核对'
}

function QueueClearMenu({ items, onClear, busy }: { items: QueuedMessage[]; onClear: () => void; busy: boolean }) {
  const confirm = useConfirm()
  const latest = useRef(items), mounted = useRef(true), trigger = useRef<HTMLDetailsElement>(null)
  const [notice, setNotice] = useState('')
  latest.current = items
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  return <details ref={trigger} tabIndex={-1} className="ml-auto shrink-0">
    <summary className="min-h-11 cursor-pointer content-center rounded px-2">更多</summary>
    <button type="button" disabled={busy} className="min-h-11 rounded px-2 text-[var(--color-destructive)]" onClick={async () => {
      const ids = items.map(item => item.id)
      const accepted = await confirm({ title: '清空待发送队列？', description: `将删除这 ${ids.length} 条队列消息，并终止其中当前任务的自动追问；其正在执行的轮次会请求终止，不代表任务已完成。`, confirmText: '确认清空', variant: 'destructive', returnFocusRef: trigger })
      if (!accepted || !mounted.current) return
      if (latest.current.length !== ids.length || latest.current.some((item, index) => item.id !== ids[index] || item.deliveryState !== items[index].deliveryState)) {
        setNotice('队列已更新，请重新核对后清空。'); return
      }
      onClear()
    }}>清空队列</button>
    {notice && <p role="status" className="max-w-40 whitespace-normal text-xs">{notice}</p>}
  </details>
}
