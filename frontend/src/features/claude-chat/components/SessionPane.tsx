import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Send, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { useClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { listSessions } from '../api'
import { MessageList } from './MessageList'
import { PermissionDialog } from './PermissionDialog'
import { QuestionDialog } from './QuestionDialog'
import { ModeSwitch } from './ModeSwitch'
import { engineName, stateLabel, stateTone } from './chatStatus'

interface Props {
  /** 本块续接的会话 id。 */
  sessionId: string
  /** 从分屏移除本块。 */
  onClose: () => void
}

function shortCwd(cwd: string): string {
  const i = Math.max(cwd.lastIndexOf('/'), cwd.lastIndexOf('\\'))
  return i >= 0 && i < cwd.length - 1 ? cwd.slice(i + 1) : cwd
}

/**
 * 并行分屏中的一个可交互会话块：自带独立 WS（useClaudeChatSocket 自包含），挂载后续接指定会话，
 * 各自发消息 / 看流式回复 / 各自权限·提问弹窗，互不干扰。
 */
export function SessionPane({ sessionId, onClose }: Props) {
  const chat = useClaudeChatSocket()
  const [draft, setDraft] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)

  // 挂载（或 sessionId 变化）后续接一次该会话
  const switchedRef = useRef<string | null>(null)
  useEffect(() => {
    if (switchedRef.current === sessionId) return
    switchedRef.current = sessionId
    chat.switchTo(sessionId)
  }, [sessionId, chat])

  // 标题取自会话列表缓存（与单会话视图共用同一 query 缓存）
  const { data: sessions = [] } = useQuery({ queryKey: ['claude-chat-sessions'], queryFn: listSessions, staleTime: 5000 })
  const meta = sessions.find(s => s.id === sessionId)
  const title = meta?.title?.trim() || (meta ? shortCwd(meta.cwd) : sessionId.slice(0, 8))

  const pending = chat.pending
  const submit = () => {
    const t = draft.trim()
    if (!t) return
    chat.send(t)
    setDraft('')
    const el = taRef.current
    if (el) el.style.height = 'auto'
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)]">
      {/* 块头 */}
      <div className="flex items-center gap-2 border-b bg-[var(--color-muted)] px-2 py-1.5">
        <StatusBadge
          tone={stateTone(chat.state)}
          pulse={chat.state === 'connecting'}
          title={stateLabel(chat.state)}
          aria-label={stateLabel(chat.state)}
          className="size-3 shrink-0 justify-center rounded-full px-0"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium" title={meta?.cwd}>{title}</span>
        <span className="shrink-0 rounded bg-[var(--color-background)] px-1 text-[10px] text-[var(--color-muted-foreground)]">
          {engineName(chat.currentEngine)}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭此块"
          className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* 消息流 */}
      <div className="min-h-0 flex-1">
        <MessageList
          items={chat.items}
          running={chat.running}
          onLoadEarlier={() => chat.loadHistory(false)}
          loadingEarlier={chat.historyLoading}
          exhausted={chat.historyExhausted}
          onFork={chat.forkSession}
          engineLabel={engineName(chat.currentEngine)}
        />
      </div>

      {/* 紧凑输入条 */}
      <div className="border-t bg-[var(--color-muted)] px-2 py-1.5">
        <div className="mb-1 flex items-center gap-1">
          <ModeSwitch mode={chat.mode} onChange={chat.setMode} />
        </div>
        <div className="flex items-end gap-1">
          <textarea
            ref={taRef}
            value={draft}
            onChange={e => {
              setDraft(e.target.value)
              const el = e.target
              el.style.height = 'auto'
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
            }}
            rows={1}
            placeholder="发消息…"
            className="max-h-[120px] min-h-[36px] flex-1 resize-none rounded-md border bg-[var(--color-background)] px-2 py-1.5 text-sm"
          />
          {chat.running ? (
            <Button variant="outline" size="icon" onClick={chat.interrupt} aria-label="中断" className="shrink-0">
              <Square className="size-4" />
            </Button>
          ) : (
            <Button size="icon" onClick={submit} disabled={!draft.trim()} aria-label="发送" className="shrink-0">
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 本块独立的权限 / 提问弹窗 */}
      {pending?.kind === 'permission' && (
        <PermissionDialog
          toolName={pending.toolName}
          input={pending.input}
          onAllow={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow' })}
          onDeny={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
        />
      )}
      {pending?.kind === 'question' && (
        <QuestionDialog
          questions={pending.questions}
          onCancel={() => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'deny' })}
          onSubmit={answers => chat.decide({ type: 'decision', reqId: pending.reqId, behavior: 'allow', answers })}
        />
      )}
    </div>
  )
}
