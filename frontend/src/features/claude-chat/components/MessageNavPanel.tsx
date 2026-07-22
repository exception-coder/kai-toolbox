import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { formatTime } from '../lib/metrics'

interface Props {
  items: ChatItem[]
  /** 传回完整消息（而非仅 id）：id 是解析时按下标生成的合成值，分页再拉一批更早历史后
   *  可能整体漂移，调用方需要 ts+文本兜底匹配，所以要把点击那一刻的原始消息一并带出去。 */
  onSelect: (item: Extract<ChatItem, { kind: 'user' }>) => void
  onClose: () => void
}

/** 消息列表里的一句预览摘要：单行、去换行、截断。 */
function preview(item: Extract<ChatItem, { kind: 'user' }>): string {
  const flat = (item.displayText ?? item.text).replace(/\s+/g, ' ').trim()
  if (flat) return flat.length > 70 ? `${flat.slice(0, 70)}…` : flat
  if (item.attachments?.some(a => a.mime?.startsWith('image/'))) return '[仅图片，无文字]'
  return '（空）'
}

/**
 * 「我的提问」导航面板：只列用户自己发出的消息（筛掉 AI 回复/工具调用/系统状态），
 * 支持按文字搜索缩小范围，点击某条直接滚到主消息流里对应位置并短暂高亮——
 * 会话问答一多，靠人工上拉翻找很低效，这是专门给"次日回来找某个问答"这种场景做的快捷入口。
 *
 * 这里列的是当前已加载进 chat.items 的消息（含已通过上拉分页取到的更早历史）；点到的目标
 * 若还在尚未加载的更早分页里，交给 ChatPage 的 pendingScroll 效果自动追加拉取更早历史直到
 * 找到或加载完为止——本面板自己不关心加载状态，只负责把点中的完整消息对象交出去。
 */
export function MessageNavPanel({ items, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')

  const userItems = useMemo(
    () => items.filter((it): it is Extract<ChatItem, { kind: 'user' }> => it.kind === 'user'),
    [items],
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return userItems
    return userItems.filter(it => (it.displayText ?? it.text).toLowerCase().includes(q))
  }, [userItems, query])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">我的提问（{userItems.length}）</span>
          <button type="button" onClick={onClose} className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]" aria-label="关闭">
            <X className="size-3.5" />
          </button>
        </div>

        <div className="border-b px-3 py-2">
          <div className="flex items-center gap-1.5 rounded-lg border bg-[var(--color-background)] px-2.5 py-1.5">
            <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索我发过的内容…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-[var(--color-muted-foreground)]">
              {userItems.length === 0 ? '当前会话还没有你发的消息' : '没有匹配的内容'}
            </p>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-[var(--color-accent)]"
            >
              <span className="mt-0.5 w-6 shrink-0 text-right text-[10px] tabular-nums text-[var(--color-muted-foreground)]">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate leading-snug">{preview(item)}</span>
                {item.ts && (
                  <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--color-muted-foreground)] opacity-70">
                    {formatTime(item.ts)}
                  </span>
                )}
              </span>
              {item.attachments && item.attachments.filter(a => a.mime?.startsWith('image/')).length > 0 && (
                <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px]', 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')}>
                  {item.attachments.filter(a => a.mime?.startsWith('image/')).length} 图
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
