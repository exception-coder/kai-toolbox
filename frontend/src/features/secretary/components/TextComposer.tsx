import { useEffect, useState, type KeyboardEvent } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  disabled?: boolean
  onSubmit: (text: string) => Promise<void> | void
}

// 触屏设备上 Enter 就是换行键，不能把它劫持成「发送」
function detectCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(pointer: coarse)').matches
}

export function TextComposer({ disabled, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [coarse, setCoarse] = useState(false)

  useEffect(() => {
    setCoarse(detectCoarsePointer())
  }, [])

  const canSubmit = !busy && !disabled && text.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit) return
    setBusy(true)
    try {
      await onSubmit(text.trim())
      setText('')
    } finally {
      setBusy(false)
    }
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    // 触屏设备下 Enter 是换行；桌面键盘 Enter 提交，Shift+Enter 换行
    if (coarse) return
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled || busy}
        rows={3}
        placeholder={coarse ? '想到什么写什么…' : '想到什么写什么，回车发送，Shift+Enter 换行…'}
        className="w-full resize-none rounded-md border bg-[var(--color-background)] px-3 py-2.5 text-base shadow-sm placeholder:text-[var(--color-muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
      />
      <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted-foreground)]">
        <span>{text.length > 0 ? `${text.length} 字` : ' '}</span>
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="min-w-24"
        >
          <Send className="size-4" />
          {busy ? '保存中…' : '发送'}
        </Button>
      </div>
    </div>
  )
}
