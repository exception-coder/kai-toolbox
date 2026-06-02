import { useEffect, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { ToolCallBubble } from './ToolCallBubble'
import { Markdown } from './Markdown'

interface Props {
  items: ChatItem[]
  running: boolean
  /** 滚到顶部触发加载更早一页 */
  onLoadEarlier?: () => void
  /** 正在加载更早 */
  loadingEarlier?: boolean
  /** 已无更早历史 */
  exhausted?: boolean
}

/** 消息流：用户气泡靠右、assistant 文本靠左、工具调用与系统标记居中。顶部上拉加载更早历史。 */
export function MessageList({ items, running, onLoadEarlier, loadingEarlier, exhausted }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const prevHeightRef = useRef(0)
  const prependingRef = useRef(false)

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    if (el.scrollTop < 80 && !loadingEarlier && !exhausted && onLoadEarlier) {
      prevHeightRef.current = el.scrollHeight
      prependingRef.current = true
      onLoadEarlier()
    }
  }

  // items 变化后：上拉 prepend 时用 scrollHeight 差补偿、保持视觉位置；否则（首屏 / 新消息）滚到底。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependingRef.current) {
      el.scrollTop += el.scrollHeight - prevHeightRef.current
      prependingRef.current = false
    } else {
      el.scrollTop = el.scrollHeight
    }
  }, [items])

  useEffect(() => {
    if (prependingRef.current) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [running])

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
      {loadingEarlier && (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">加载更早…</div>
      )}
      {exhausted && items.length > 0 && (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">— 没有更早了 —</div>
      )}
      {items.map(item => (
        <Row key={item.id} item={item} />
      ))}
      {running && (
        <div className="text-sm text-[var(--color-muted-foreground)]">Claude 正在思考…</div>
      )}
    </div>
  )
}

function Row({ item }: { item: ChatItem }) {
  switch (item.kind) {
    case 'user':
      return (
        <div className="flex justify-end">
          <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl bg-[var(--color-primary)] px-4 py-2 text-[var(--color-primary-foreground)]">
            {item.text}
          </div>
        </div>
      )
    case 'assistant':
      return (
        <div className="flex justify-start">
          <div className="max-w-[90%] break-words rounded-2xl bg-[var(--color-muted)] px-4 py-2">
            <Markdown text={item.text} />
          </div>
        </div>
      )
    case 'tool':
      return <ToolCallBubble toolName={item.toolName} input={item.input} output={item.output} isError={item.isError} />
    case 'result':
      return (
        <div className="text-center text-xs text-[var(--color-muted-foreground)]">
          — 本轮结束（{item.stopReason}）—
        </div>
      )
    case 'error':
      return (
        <div className={cn('rounded-lg border border-[var(--color-destructive)] px-3 py-2 text-sm text-[var(--color-destructive)]')}>
          {item.code}: {item.message}
        </div>
      )
  }
}
