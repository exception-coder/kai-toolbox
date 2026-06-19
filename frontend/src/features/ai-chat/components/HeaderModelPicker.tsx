import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'
import { groupModels, modelDot, modelPlatform, sortByReasoning } from '../lib/modelGroups'

type SortMode = 'platform' | 'reasoning'

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
  const [sort, setSort] = useState<SortMode>('platform')
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

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return kw
      ? models.filter((m) => m.id.toLowerCase().includes(kw) || m.label.toLowerCase().includes(kw))
      : models
  }, [models, q])

  const groups = useMemo(() => groupModels(filtered), [filtered])
  const ranked = useMemo(() => sortByReasoning(filtered), [filtered])

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
          {/* 排序：平台分组 vs 按推理力扁平排序 */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <span className="mr-1 text-[11px] text-[var(--color-muted-foreground)]">排序</span>
            {([['platform', '平台'], ['reasoning', '推理力']] as const).map(([mode, text]) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSort(mode)}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  sort === mode
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
                )}
              >
                {text}
              </button>
            ))}
          </div>
          <div className="max-h-[55vh] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">无匹配模型</p>
            )}
            {sort === 'platform'
              ? groups.map((g) => (
                  <div key={g.key} className="mb-1">
                    <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">{g.label}</div>
                    {g.models.map((m) => (
                      <ModelRow key={m.id} m={m} selected={m.id === value} onPick={pick} />
                    ))}
                  </div>
                ))
              : ranked.map((m) => <ModelRow key={m.id} m={m} selected={m.id === value} onPick={pick} showPlatform />)}
          </div>
        </div>
      )}
    </div>
  )
}

/** 模型下拉的一行：配色圆点 + 名称（+ 推理排序下的平台后缀）+ 多模态标记 + 选中勾。 */
function ModelRow({
  m,
  selected,
  onPick,
  showPlatform,
}: {
  m: ModelInfo
  selected: boolean
  onPick: (id: string) => void
  showPlatform?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(m.id)}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]',
        selected && 'bg-[var(--color-accent)]/60',
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', modelDot(m.id))} />
      <span className="min-w-0 flex-1 truncate">{m.label}</span>
      {showPlatform && (
        <span className="shrink-0 text-[10px] text-[var(--color-muted-foreground)]">{modelPlatform(m.id).label.split(' · ')[0]}</span>
      )}
      {m.multimodal && <span className="shrink-0 text-xs" title="支持图片输入">🖼</span>}
      {selected && <Check className="size-3.5 shrink-0 text-[var(--color-primary)]" />}
    </button>
  )
}
