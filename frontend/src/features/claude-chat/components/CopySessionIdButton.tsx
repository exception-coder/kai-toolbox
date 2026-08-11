import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Fingerprint } from 'lucide-react'

interface Props {
  sessionId: string
}

type CopyState = 'idle' | 'copied' | 'failed'

/** 复制 Forge 会话 ID，并在原操作位反馈复制结果。 */
export function CopySessionIdButton({ sessionId }: Props) {
  const [copyState, setCopyState] = useState<CopyState>('idle')
  const resetTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
  }, [])

  const copySessionId = async () => {
    try {
      await navigator.clipboard.writeText(sessionId)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
    if (resetTimer.current != null) window.clearTimeout(resetTimer.current)
    resetTimer.current = window.setTimeout(() => setCopyState('idle'), 1_500)
  }

  const label = copyState === 'copied'
    ? '会话 ID 已复制'
    : copyState === 'failed'
      ? '复制会话 ID 失败'
      : '复制会话 ID'

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation()
        void copySessionId()
      }}
      aria-label={label}
      title={`${label}\n${sessionId}`}
      className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
    >
      {copyState === 'copied'
        ? <Check className="size-3.5 text-emerald-600" />
        : copyState === 'failed'
          ? <CircleAlert className="size-3.5 text-[var(--color-destructive)]" />
          : <Fingerprint className="size-3.5" />}
    </button>
  )
}
