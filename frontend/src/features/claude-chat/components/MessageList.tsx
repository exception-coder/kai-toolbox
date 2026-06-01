import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { ChatItem } from '../types'
import { ToolCallBubble } from './ToolCallBubble'

interface Props {
  items: ChatItem[]
  running: boolean
}

/** 消息流：用户气泡靠右、assistant 文本靠左、工具调用与系统标记居中。 */
export function MessageList({ items, running }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items, running])

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-3 py-4">
      {items.map(item => (
        <Row key={item.id} item={item} />
      ))}
      {running && (
        <div className="text-sm text-[var(--color-muted-foreground)]">Claude 正在思考…</div>
      )}
      <div ref={bottomRef} />
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
          <div className="max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-[var(--color-muted)] px-4 py-2">
            {item.text}
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
