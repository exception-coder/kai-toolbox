import { useEffect, useRef, useState } from 'react'
import { Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  /** 被选中的文本片段（来自 useTextSelection） */
  token: string
  /** 选区相对视口的位置 */
  anchorRect: DOMRect
  /** 选中文本所在的字段（如 'url' / 'body' / 'header.X' / 'query.X'） */
  field: string
  /** 当前已有的变量名建议（来自 task.params 与上游 step.extracts） */
  varSuggestions: string[]
  onConfirm: (varName: string) => void
  onCancel: () => void
}

/**
 * 选中文本后浮出的小气泡：让用户输入或选已有的变量名，命名为参数。
 * 通过 fixed 定位贴在选区下方。
 */
export function ParameterizeBubble({
  token, anchorRect, field, varSuggestions, onConfirm, onCancel,
}: Props) {
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 自动聚焦输入
    const t = setTimeout(() => {
      ref.current?.querySelector('input')?.focus()
    }, 0)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(name)

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[280px] rounded-lg border bg-[var(--color-card)] p-2 shadow-xl"
      style={{
        left: Math.max(8, Math.min(anchorRect.left, window.innerWidth - 296)),
        top: anchorRect.bottom + 6,
      }}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className="mb-1 flex items-center gap-1 text-xs text-[var(--color-muted-foreground)]">
        <Tag className="size-3" />
        命名变量
        <span className="ml-auto font-mono text-[10px]">字段：{field}</span>
      </div>
      <div className="mb-2 max-w-full truncate rounded bg-[var(--color-muted)] px-2 py-1 font-mono text-xs">
        {token}
      </div>
      <Input
        placeholder="变量名（字母 / 数字 / 下划线）"
        value={name}
        onChange={e => setName(e.target.value.trim())}
        onKeyDown={e => { if (e.key === 'Enter' && valid) onConfirm(name) }}
      />
      {varSuggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {varSuggestions.map(v => (
            <button
              key={v}
              onClick={() => setName(v)}
              className="rounded bg-[var(--color-muted)] px-2 py-0.5 text-xs hover:bg-[var(--color-accent)]"
            >
              {v}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" disabled={!valid} onClick={() => onConfirm(name)}>
          确认
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          取消
        </Button>
      </div>
    </div>
  )
}
