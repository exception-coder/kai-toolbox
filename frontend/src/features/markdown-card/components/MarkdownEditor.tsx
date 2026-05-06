import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardPaste, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface MarkdownEditorProps {
  value: string
  onChange: (next: string) => void
  className?: string
}

const SOFT_LIMIT = 50000

export function MarkdownEditor({ value, onChange, className }: MarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const pasteZoneRef = useRef<HTMLTextAreaElement>(null)
  const [showPasteZone, setShowPasteZone] = useState(false)

  const stats = useMemo(() => ({
    len: value.length,
    lines: value === '' ? 0 : value.split('\n').length,
  }), [value])

  // 自动聚焦粘贴区
  useEffect(() => {
    if (showPasteZone) pasteZoneRef.current?.focus()
  }, [showPasteZone])

  // 关闭粘贴区 ESC
  useEffect(() => {
    if (!showPasteZone) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowPasteZone(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showPasteZone])

  async function handlePasteClick() {
    // 优先用 Clipboard API（HTTPS / localhost）
    if (navigator.clipboard?.readText) {
      try {
        const text = await navigator.clipboard.readText()
        onChange(text)
        textareaRef.current?.focus()
        return
      } catch {
        // 权限拒绝或不支持，回退到粘贴区
      }
    }
    // 兜底：弹内联粘贴区，通过 paste 事件读文本（无需剪贴板权限）
    setShowPasteZone(true)
  }

  function handlePasteEvent(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData('text')
    if (text) {
      onChange(text)
      setShowPasteZone(false)
    }
    e.preventDefault()
  }

  return (
    <div className={cn('relative flex h-full flex-col rounded-lg border bg-[var(--color-card)]', className)}>

      {/* 工具栏 */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-xs font-medium text-[var(--color-muted-foreground)]">Markdown</span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-7 gap-1.5 px-2 text-xs"
          onClick={handlePasteClick}
          title="粘贴剪贴板内容覆盖当前文本"
        >
          <ClipboardPaste className="h-3.5 w-3.5" />
          粘贴覆盖
        </Button>
        <span className="hidden tabular-nums text-[11px] text-[var(--color-muted-foreground)] sm:inline">
          {stats.lines}行·{stats.len.toLocaleString()}字
        </span>
      </div>

      {stats.len > SOFT_LIMIT && (
        <div className="border-b bg-amber-50 px-3 py-1.5 text-xs text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          已超过 {SOFT_LIMIT.toLocaleString()} 字软限，实时预览暂停
        </div>
      )}

      {/* 主编辑区 */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
        className={cn(
          'flex-1 resize-none bg-transparent px-3 py-3 font-mono text-sm leading-relaxed outline-none',
          'placeholder:text-[var(--color-muted-foreground)]',
        )}
        placeholder={'在这里输入或粘贴 Markdown 文本…\n用 --- 单独占一行可在「幻灯」模式中手动分页'}
      />

      {/* 内联粘贴区覆盖层（Clipboard API 不可用时的兜底） */}
      {showPasteZone && (
        <div className="absolute inset-0 z-10 flex flex-col rounded-lg bg-[var(--color-card)]">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs font-medium">
              在下方按 <kbd className="rounded border px-1 font-mono text-[10px]">Ctrl+V</kbd>
              {' '}/<kbd className="rounded border px-1 font-mono text-[10px]">⌘V</kbd> 粘贴
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowPasteZone(false)}
              title="取消"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <textarea
            ref={pasteZoneRef}
            className="flex-1 resize-none bg-transparent px-3 py-3 text-sm outline-none placeholder:text-[var(--color-muted-foreground)]"
            placeholder="点击此处，然后按 Ctrl+V 粘贴，内容将自动覆盖编辑区…"
            onPaste={handlePasteEvent}
            readOnly
          />
          <div className="border-t px-3 py-2 text-[11px] text-[var(--color-muted-foreground)]">
            提示：非 HTTPS 环境下浏览器会限制自动读取剪贴板，需要手动触发粘贴
          </div>
        </div>
      )}
    </div>
  )
}
