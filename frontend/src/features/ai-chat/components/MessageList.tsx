import { useEffect, useRef } from 'react'
import { Bot, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MessageView } from '../types'

interface Props {
  messages: MessageView[]
  streaming: boolean
  streamText: string
}

export function MessageList({ messages, streaming, streamText }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText, streaming])

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-4">
      {messages.length === 0 && !streaming && (
        <p className="py-16 text-center text-sm text-[var(--color-muted-foreground)]">
          发一条消息开始对话
        </p>
      )}
      {messages.map((m) => (
        <Bubble key={m.id} role={m.role}>
          {m.attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {m.attachments.map((a) => (
                <img key={a.id} src={a.url} alt={a.name} className="max-h-40 rounded-md border" />
              ))}
            </div>
          )}
          <div className="whitespace-pre-wrap break-words">{m.content}</div>
          {m.status === 'INTERRUPTED' && <StatusNote text="已停止" />}
          {m.status === 'ERROR' && <StatusNote text="出错" error />}
        </Bubble>
      ))}
      {streaming && (
        <Bubble role="ASSISTANT">
          <div className="whitespace-pre-wrap break-words">
            {streamText}
            <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-current align-middle" />
          </div>
        </Bubble>
      )}
      <div ref={bottomRef} />
    </div>
  )
}

function Bubble({ role, children }: { role: MessageView['role']; children: React.ReactNode }) {
  const isUser = role === 'USER'
  return (
    <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
            : 'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)]',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2 text-sm',
          isUser
            ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
            : 'bg-[var(--color-muted)] text-[var(--color-foreground)]',
        )}
      >
        {children}
      </div>
    </div>
  )
}

function StatusNote({ text, error }: { text: string; error?: boolean }) {
  return (
    <div
      className={cn(
        'mt-1 text-xs',
        error ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]',
      )}
    >
      — {text}
    </div>
  )
}
