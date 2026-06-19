import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, RefreshCw, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ModelInfo } from '../types'
import { capabilityTags, groupByPlatform, modelDot, modelPlatform, sceneTagsOf } from '../lib/modelGroups'
import { buildFamilies, effortLabel, effortOf, familyKey, familyScore, type ModelFamily } from '../lib/modelFamilies'

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
 * 同家族的 effort 变体（gpt-5.5-high/medium/low）折叠为一行 + 档位切换；按平台分组或按能力排序，
 * 支持搜索与场景标签筛选。
 */
export function HeaderModelPicker({ models, value, onChange, fallback, onRefresh, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<SortMode>('platform')
  const [tag, setTag] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  // 触发器：家族名 + 当前档位（gpt-5.5 · 高）
  const triggerLabel = useMemo(() => {
    const m = models.find((x) => x.id === value)
    const base = m?.label ?? value ?? '选择模型'
    const e = effortOf(value ?? '')
    const baseName = familyKey(m?.label ?? value ?? '') || base
    return e === 'default' ? base : `${baseName} · ${effortLabel(e)}`
  }, [models, value])

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

  // 场景筛选项：从模型真实标签数据驱动生成（推理/工具/文件/多模态/音频/开源权重…）。
  const sceneTags = useMemo(() => sceneTagsOf(models), [models])

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return models.filter((m) => {
      if (tag && !(m.tags ?? []).includes(tag)) return false
      if (kw && !(m.id.toLowerCase().includes(kw) || m.label.toLowerCase().includes(kw))) return false
      return true
    })
  }, [models, q, tag])

  const families = useMemo(() => buildFamilies(filtered), [filtered])

  // 平台分组：每组内家族按能力分降序
  const grouped = useMemo(
    () =>
      groupByPlatform(families, (f) => f.rep.id).map((g) => ({
        key: g.key,
        label: g.label,
        families: g.items.slice().sort((a, b) => familyScore(b) - familyScore(a) || a.key.localeCompare(b.key)),
      })),
    [families],
  )
  // 能力排序：全部家族扁平按能力分降序
  const ranked = useMemo(
    () => families.slice().sort((a, b) => familyScore(b) - familyScore(a) || a.key.localeCompare(b.key)),
    [families],
  )

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
          'inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border bg-[var(--color-background)] px-3 py-1.5 text-sm font-medium',
          'hover:bg-[var(--color-accent)] disabled:opacity-50',
        )}
      >
        <span className={cn('size-2 shrink-0 rounded-full', modelDot(value))} />
        <span className="truncate">{triggerLabel}</span>
        {fallback && <span className="shrink-0 text-[11px] text-amber-600 dark:text-amber-400">·兜底</span>}
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-80 overflow-hidden rounded-lg border bg-[var(--color-background)] shadow-lg">
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
          {/* 排序：平台分组 vs 按能力 */}
          <div className="flex items-center gap-1 border-b px-2 py-1.5">
            <span className="mr-1 text-[11px] text-[var(--color-muted-foreground)]">排序</span>
            {([['platform', '平台'], ['reasoning', '能力']] as const).map(([mode, text]) => (
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
          {/* 场景筛选：按能力标签过滤（推理/工具/文件/多模态） */}
          {sceneTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
              <span className="mr-1 text-[11px] text-[var(--color-muted-foreground)]">场景</span>
              {sceneTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTag((cur) => (cur === t ? null : t))}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-[11px] font-medium',
                    tag === t
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                      : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto py-1">
            {families.length === 0 && (
              <p className="px-3 py-4 text-center text-xs text-[var(--color-muted-foreground)]">无匹配模型</p>
            )}
            {sort === 'platform'
              ? grouped.map((g) => (
                  <div key={g.key} className="mb-1">
                    <div className="px-3 pb-0.5 pt-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">{g.label}</div>
                    {g.families.map((f) => (
                      <FamilyRow key={f.key} family={f} selectedId={value} onPick={pick} />
                    ))}
                  </div>
                ))
              : ranked.map((f) => <FamilyRow key={f.key} family={f} selectedId={value} onPick={pick} showPlatform />)}
          </div>
        </div>
      )}
    </div>
  )
}

// 能力标签配色（与场景筛选一致的语义色）。
const TAG_TONE: Record<string, string> = {
  推理: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  多模态: 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  工具: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  文件: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  音频: 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  开源权重: 'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
}

/**
 * 一个家族一行：配色圆点 + 家族名 + 能力徽章（介绍 tooltip）+ 平台后缀 + effort 档位切换。
 * 无 effort 变体的家族退化为单选行。
 */
function FamilyRow({
  family,
  selectedId,
  onPick,
  showPlatform,
}: {
  family: ModelFamily
  selectedId: string
  onPick: (id: string) => void
  showPlatform?: boolean
}) {
  const rep = family.rep
  const tags = capabilityTags(rep)
  const title = rep.description || (rep.tags?.length ? rep.tags.join(' · ') : undefined)
  const selectedHere = family.members.some((x) => x.model.id === selectedId)
  // 不支持自定义温度（推理模型）——标出来，选模型时一眼可见。
  const fixedTemp = !rep.supportsTemperature

  // 能力徽章 + 固定温度标记 + 平台后缀，放模型名下方第二行（让模型名第一行完整显示，不被挤截断）。
  const metaLine =
    tags.length > 0 || fixedTemp || showPlatform ? (
      <div className="mt-0.5 flex flex-wrap items-center gap-1 pl-4">
        {tags.map((t) => (
          <span key={t} className={cn('rounded px-1 py-0.5 text-[9px] font-medium leading-none', TAG_TONE[t] ?? 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)]')}>
            {t}
          </span>
        ))}
        {fixedTemp && (
          <span className="rounded bg-[var(--color-muted)] px-1 py-0.5 text-[9px] font-medium leading-none text-[var(--color-muted-foreground)]" title="该模型不支持自定义温度（使用模型默认值）">
            固定温度
          </span>
        )}
        {showPlatform && (
          <span className="text-[10px] text-[var(--color-muted-foreground)]">{modelPlatform(rep.id).label.split(' · ')[0]}</span>
        )}
      </div>
    ) : null

  // 单一模型：整行可点，模型名完整换行显示
  if (!family.hasEffort) {
    const only = family.members[0].model
    return (
      <button
        type="button"
        onClick={() => onPick(only.id)}
        title={title}
        className={cn(
          'block w-full px-3 py-1.5 text-left text-sm hover:bg-[var(--color-accent)]',
          only.id === selectedId && 'bg-[var(--color-accent)]/60',
        )}
      >
        <div className="flex items-start gap-2">
          <span className={cn('mt-1 size-2 shrink-0 rounded-full', modelDot(only.id))} />
          <span className="min-w-0 flex-1 wrap-anywhere">{only.label}</span>
          {only.id === selectedId && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-primary)]" />}
        </div>
        {metaLine}
      </button>
    )
  }

  // 家族 + effort 档位切换
  return (
    <div className={cn('px-3 py-1.5', selectedHere && 'bg-[var(--color-accent)]/60')} title={title}>
      <div className="flex items-start gap-2 text-sm">
        <span className={cn('mt-1 size-2 shrink-0 rounded-full', modelDot(rep.id))} />
        <span className="min-w-0 flex-1 wrap-anywhere">{family.label}</span>
        {selectedHere && <Check className="mt-0.5 size-3.5 shrink-0 text-[var(--color-primary)]" />}
      </div>
      {metaLine}
      <div className="mt-1 flex flex-wrap items-center gap-1 pl-4">
        {family.members.map(({ effort, model }) => (
          <button
            key={model.id}
            type="button"
            onClick={() => onPick(model.id)}
            title={`${model.id}`}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
              model.id === selectedId
                ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                : 'bg-[var(--color-muted)] text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]',
            )}
          >
            {effortLabel(effort)}
          </button>
        ))}
      </div>
    </div>
  )
}
