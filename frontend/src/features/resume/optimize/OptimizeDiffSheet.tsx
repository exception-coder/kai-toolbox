// 优化结果对比抽屉：流式生成 → 按字段分组对比（原文/优化后相邻）→ 优化后可直接编辑、逐字段采纳 → 写回。
// 移动端友好：不再左右两栏（窄屏要来回滚），改为每个字段一组、组内上下对照，且优化后可改。
import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Sparkles, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { optimizeStream, type OptimizeRequest } from './api'
import { parseStreamedResult } from './resultParser'
import {
  OPTIMIZE_ENGINES,
  SENIORITY_LEVELS,
  type OptimizationResult,
  type OptimizeEngine,
  type SectionType,
  type SeniorityLevel,
} from './types'

export interface OptimizeDiffSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionType: SectionType
  /** 当前 section 的原始内容（结构化 section 是 JSON 字符串，自我介绍是纯文本） */
  originalContent: string
  /** 目标岗位（必填，来自 basics.jobIntent） */
  targetRole: string
  /** 工作年限（年），可选；由 basics.experienceYears 解析 */
  experienceYears?: number
  /** 岗位级别，前端基于年限推断 */
  seniorityLevel?: SeniorityLevel
  otherSectionsBrief?: string
  /** 用户点「接受」时调用，由调用方决定如何把 optimizedContent 写回主状态 */
  onAccept: (result: OptimizationResult) => void
  /** 用于在抽屉头部展示当前条目的标题，仅显示用 */
  itemTitle?: string
}

type Phase = 'idle' | 'streaming' | 'done' | 'error'
type FieldKind = 'scalar' | 'multiline' | 'list'
interface FieldDesc {
  key: string
  label: string
  kind: FieldKind
}

/** 各 section 的字段表：决定分组对比的字段与编辑控件类型。 */
const FIELD_SCHEMA: Record<SectionType, FieldDesc[]> = {
  WORK: [
    { key: 'company', label: '公司', kind: 'scalar' },
    { key: 'role', label: '职位', kind: 'scalar' },
    { key: 'period', label: '时间', kind: 'scalar' },
    { key: 'responsibilities', label: '内容', kind: 'list' },
    { key: 'achievements', label: '业绩', kind: 'list' },
  ],
  PROJECT: [
    { key: 'name', label: '项目', kind: 'scalar' },
    { key: 'role', label: '角色', kind: 'scalar' },
    { key: 'period', label: '时间', kind: 'scalar' },
    { key: 'description', label: '描述', kind: 'multiline' },
    { key: 'responsibilities', label: '内容', kind: 'list' },
    { key: 'achievements', label: '业绩', kind: 'list' },
  ],
  SELF_INTRO: [{ key: 'text', label: '个人优势', kind: 'multiline' }],
}

/** 把 section 内容（JSON 字符串或纯文本）拆成"字段 key → 字符串"映射；list 字段用换行连接便于 textarea 编辑。 */
function toFieldMap(content: string, schema: FieldDesc[]): Record<string, string> {
  if (schema.length === 1 && schema[0].key === 'text') {
    return { text: content ?? '' }
  }
  let obj: Record<string, unknown> = {}
  try {
    obj = JSON.parse(content) as Record<string, unknown>
  } catch {
    obj = {}
  }
  const m: Record<string, string> = {}
  for (const f of schema) {
    const v = obj[f.key]
    if (f.kind === 'list') m[f.key] = Array.isArray(v) ? v.map(String).join('\n') : ''
    else m[f.key] = v == null ? '' : String(v)
  }
  return m
}

/** 按"采纳=用编辑后的优化值 / 不采纳=保留原文"拼回 optimizedContent（结构化回 JSON 字符串，自我介绍回纯文本）。 */
function buildContent(
  schema: FieldDesc[],
  edited: Record<string, string>,
  orig: Record<string, string>,
  accepted: Record<string, boolean>,
): string {
  if (schema.length === 1 && schema[0].key === 'text') {
    return (accepted.text ?? true) ? edited.text ?? '' : orig.text ?? ''
  }
  const obj: Record<string, unknown> = {}
  for (const f of schema) {
    const src = (accepted[f.key] ?? true) ? edited[f.key] ?? '' : orig[f.key] ?? ''
    obj[f.key] = f.kind === 'list' ? src.split('\n').map(s => s.trim()).filter(Boolean) : src
  }
  return JSON.stringify(obj)
}

export function OptimizeDiffSheet({
  open,
  onOpenChange,
  sectionType,
  originalContent,
  targetRole,
  experienceYears,
  seniorityLevel,
  otherSectionsBrief,
  onAccept,
  itemTitle,
}: OptimizeDiffSheetProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [rawStream, setRawStream] = useState('')
  const [result, setResult] = useState<OptimizationResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [engine, setEngine] = useState<OptimizeEngine>('fast')
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const abortRef = useRef<(() => void) | null>(null)

  const schema = FIELD_SCHEMA[sectionType]
  const origFields = useMemo(() => toFieldMap(originalContent, schema), [originalContent, schema])

  // 打开时自动触发一次优化
  useEffect(() => {
    if (open) {
      runOptimize()
    } else {
      abortRef.current?.()
      abortRef.current = null
      setPhase('idle')
      setRawStream('')
      setResult(null)
      setError(null)
      setEdited({})
      setAccepted({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 结果就绪：初始化可编辑字段 + 默认全部采纳
  useEffect(() => {
    if (result) {
      setEdited(toFieldMap(result.optimizedContent, schema))
      setAccepted(Object.fromEntries(schema.map(f => [f.key, true])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, sectionType])

  function runOptimize(nextEngine: OptimizeEngine = engine) {
    abortRef.current?.()
    setPhase('streaming')
    setRawStream('')
    setResult(null)
    setError(null)

    const req: OptimizeRequest = {
      sectionType,
      originalContent,
      targetRole,
      experienceYears,
      seniorityLevel,
      otherSectionsBrief,
      engine: nextEngine,
    }

    abortRef.current = optimizeStream(req, {
      onProgress: acc => setRawStream(acc),
      onDone: acc => {
        setResult(parseStreamedResult(acc))
        setPhase('done')
        abortRef.current = null
      },
      onError: err => {
        setError(err.message)
        setPhase('error')
        abortRef.current = null
      },
    })
  }

  function stop() {
    abortRef.current?.()
    abortRef.current = null
    if (rawStream) {
      setResult(parseStreamedResult(rawStream))
      setPhase('done')
    } else {
      setPhase('idle')
    }
  }

  function accept() {
    if (!result) return
    const optimizedContent = buildContent(schema, edited, origFields, accepted)
    onAccept({ ...result, optimizedContent })
    onOpenChange(false)
  }

  const acceptedCount = schema.filter(f => accepted[f.key] ?? true).length

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-3 p-4 sm:max-w-2xl md:max-w-3xl lg:max-w-4xl"
        hideCloseButton
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--color-primary)]" />
              AI 优化 · {sectionLabel(sectionType)}
              {itemTitle && <span className="text-[var(--color-muted-foreground)] font-normal">{itemTitle}</span>}
            </SheetTitle>
            <SheetDescription>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>定位：</span>
                <span className="rounded-md border bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">{targetRole}</span>
                {seniorityLevel && (
                  <span className="rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
                    {SENIORITY_LEVELS[seniorityLevel].label}
                    {experienceYears != null && ` · ${experienceYears} 年`}
                  </span>
                )}
              </span>
            </SheetDescription>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded p-1 hover:bg-[var(--color-accent)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 引擎切换：fast / quality */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--color-muted-foreground)]">引擎</span>
          <div className="inline-flex rounded-md border p-0.5">
            {(['fast', 'quality'] as OptimizeEngine[]).map(e => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  if (e === engine) return
                  setEngine(e)
                  runOptimize(e)
                }}
                title={OPTIMIZE_ENGINES[e].hint}
                className={cn(
                  'rounded px-2 py-0.5 transition-colors',
                  engine === e
                    ? 'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                )}
              >
                {OPTIMIZE_ENGINES[e].label}
              </button>
            ))}
          </div>
          <span className="text-[var(--color-muted-foreground)]">{OPTIMIZE_ENGINES[engine].hint}</span>
        </div>

        {/* 匹配能力 */}
        {result && result.highlightedSkills.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 px-3 py-2">
            <span className="text-xs font-medium text-[var(--color-primary)]">匹配能力</span>
            {result.highlightedSkills.map((k, i) => (
              <span
                key={i}
                className="rounded-full bg-[var(--color-primary)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-primary-foreground)]"
              >
                {k}
              </span>
            ))}
          </div>
        )}

        {/* 对比区 */}
        {phase === 'done' && result ? (
          <div className="flex-1 space-y-2 overflow-auto">
            <div className="flex items-center justify-between px-0.5 text-[11px] text-[var(--color-muted-foreground)]">
              <span>逐字段对比，优化后可直接改；取消「采纳」则该字段保留原文</span>
              <span>采纳 {acceptedCount}/{schema.length}</span>
            </div>
            {schema.map(f => (
              <FieldGroup
                key={f.key}
                desc={f}
                original={origFields[f.key] ?? ''}
                value={edited[f.key] ?? ''}
                accepted={accepted[f.key] ?? true}
                onValue={v => setEdited(s => ({ ...s, [f.key]: v }))}
                onToggle={() => setAccepted(s => ({ ...s, [f.key]: !(s[f.key] ?? true) }))}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-1 flex-col gap-2 overflow-auto">
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--color-muted-foreground)]">
              {phase === 'streaming' ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-primary)]" />
                  生成中…
                </>
              ) : (
                '原文'
              )}
            </div>
            <pre className="flex-1 overflow-auto whitespace-pre-wrap rounded-md border bg-[var(--color-muted)]/20 px-3 py-2 text-xs">
              {phase === 'streaming' ? rawStream : displayOriginal(originalContent, sectionType)}
            </pre>
          </div>
        )}

        {/* 改动说明 */}
        {result && result.changeNotes.length > 0 && (
          <details className="rounded-md border bg-[var(--color-card)] px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">关键改动说明 ({result.changeNotes.length})</summary>
            <ul className="mt-2 space-y-1 text-[var(--color-muted-foreground)]">
              {result.changeNotes.map((n, i) => (
                <li key={i} className="pl-3 relative">
                  <span className="absolute left-0">·</span>
                  {n}
                </li>
              ))}
            </ul>
          </details>
        )}

        {error && (
          <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 px-3 py-2 text-xs text-[var(--color-destructive)]">
            {error}
          </div>
        )}

        {/* 操作栏 */}
        <footer className="flex items-center justify-end gap-2 border-t pt-3">
          {phase === 'streaming' && (
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="h-3.5 w-3.5" />
              停止生成
            </Button>
          )}
          {phase !== 'streaming' && (
            <Button variant="outline" size="sm" onClick={() => runOptimize()}>
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="lg" disabled={!result || phase !== 'done'} onClick={accept} className="shadow-md">
            <CheckCircle2 className="h-4 w-4" />
            采纳 {acceptedCount} 项并写回
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  )
}

function sectionLabel(t: SectionType): string {
  switch (t) {
    case 'WORK':
      return '工作经历'
    case 'PROJECT':
      return '项目经历'
    case 'SELF_INTRO':
      return '个人优势'
  }
}

/** 非 done 阶段展示原文：结构化段尽量解析成可读文本，失败退回原串。 */
function displayOriginal(content: string, sectionType: SectionType): string {
  if (sectionType === 'SELF_INTRO') return content || '（空）'
  try {
    const o = JSON.parse(content) as Record<string, unknown>
    return Object.entries(o)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? '\n  - ' + v.map(String).join('\n  - ') : String(v ?? '')}`)
      .join('\n')
  } catch {
    return content || '（空）'
  }
}

/** 单字段对比组：上「原文（灰，只读）」下「优化后（绿，可编辑）」+「采纳」开关。 */
function FieldGroup({
  desc,
  original,
  value,
  accepted,
  onValue,
  onToggle,
}: {
  desc: FieldDesc
  original: string
  value: string
  accepted: boolean
  onValue: (v: string) => void
  onToggle: () => void
}) {
  const changed = value.trim() !== original.trim()
  return (
    <div className={cn('rounded-md border', accepted ? 'border-[var(--color-primary)]/40' : 'opacity-60')}>
      <div className="flex items-center justify-between border-b bg-[var(--color-card)] px-3 py-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          {desc.label}
          {changed && (
            <span className="rounded bg-emerald-500/15 px-1 text-[10px] font-normal text-emerald-600 dark:text-emerald-400">
              已改
            </span>
          )}
        </span>
        <label className="flex cursor-pointer items-center gap-1 text-[11px]">
          <input type="checkbox" checked={accepted} onChange={onToggle} className="accent-[var(--color-primary)]" />
          采纳
        </label>
      </div>
      <div className="space-y-2 px-3 py-2">
        <div>
          <div className="mb-0.5 text-[10px] text-[var(--color-muted-foreground)]">原文</div>
          {desc.kind === 'list' ? (
            <OriginalLines text={original} />
          ) : (
            <p className="whitespace-pre-wrap text-xs text-[var(--color-muted-foreground)]">{original || '（空）'}</p>
          )}
        </div>
        <div>
          <div className="mb-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
            优化后（可改{desc.kind === 'list' ? '，每行一条' : ''}）
          </div>
          {desc.kind === 'scalar' ? (
            <input
              value={value}
              disabled={!accepted}
              onChange={e => onValue(e.target.value)}
              className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] disabled:opacity-50"
            />
          ) : (
            <textarea
              value={value}
              disabled={!accepted}
              onChange={e => onValue(e.target.value)}
              rows={desc.kind === 'list' ? Math.max(3, value.split('\n').length) : 3}
              className="w-full rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)] disabled:opacity-50"
            />
          )}
        </div>
      </div>
    </div>
  )
}

function OriginalLines({ text }: { text: string }) {
  const lines = text.split('\n').filter(Boolean)
  if (lines.length === 0) return <span className="text-xs text-[var(--color-muted-foreground)]">（空）</span>
  return (
    <ul className="space-y-0.5">
      {lines.map((l, i) => (
        <li key={i} className="relative pl-3 text-xs text-[var(--color-muted-foreground)]">
          <span className="absolute left-0">·</span>
          {l}
        </li>
      ))}
    </ul>
  )
}
