import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'
import { groupModels, modelDot } from '../lib/modelGroups'

interface Props {
  models: ModelInfo[]
  value: string
  onChange: (id: string) => void
  /** 当前为兜底清单（远端不可达）。 */
  fallback?: boolean
  onRefresh?: () => void
  disabled?: boolean
}

/**
 * 标题栏常驻的模型选择器（Cursor 风格 Badge + 下拉）：把「切模型」从右抽屉提升为高频主路径。
 * 触发器显示供应商配色圆点 + 当前模型名；下拉内按平台分组、带搜索过滤，点击即切换。
 */
export function HeaderModelPicker({ models, value, onChange, fallback, onRefresh, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const current = models.find((m) => m.id === value)
  const label = current?.label ?? value ?? '选择模型'

  // 点击外部 / Esc 关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const filtered = kw
      ? models.filter((m) => m.id.toLowerCase().includes(kw) || m.label.toLowerCase().includes(kw))
      : models
    return groupModels(filtered)
  }, [models, q])

  const pick = (id: string) => {
    onChange(id)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        title="切换模型"
        className={cn(
          'inline-flex max-w-[15rem] items-center gap-1.5 rounded-full border bg-[var(--color-background)] px-3 py-1.5 text-sm font-medium',
          'hover:bg-[var(--color-accent)] disabled:opacity-50',
        )}
      >
        <span className={cn('size-2 shrink-0 rounded-full', modelDot(value))} />
        <span className="truncate">{label}</span>
        {fallback && <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">·兜底</span>}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-72 overflow-hidden rounded-lg border bg-[var(--color-background)] shadow-lg">
          <div className="flex items-center gap-1.5 border-b px-2 py-1.5">
            <Search className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索模型…"
              className="h-6 min-w-0 flex-1 bg-transparent text-sm focus-visible:outline-none"
            />
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                title="刷新模型清单"
                className="shrink-0 rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              >
                <RefreshCw className="size-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {groups.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">无匹配模型</p>
            )}
            {groups.map((g) => (
              <div key={g.key} className="mb-1">
                <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">{g.label}</div>
                {g.models.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]',
                      m.id === value && 'bg-[var(--color-accent)]/60',
                    )}
                  >
                    <span className={cn('size-2 shrink-0 rounded-full', modelDot(m.id))} />
                    <span className="min-w-0 flex-1 truncate">{m.label}</span>
                    {m.multimodal && <span className="shrink-0 text-xs" title="支持图片输入">🖼</span>}
                    {m.id === value && <Check className="size-3.5 shrink-0 text-[var(--color-primary)]" />}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
