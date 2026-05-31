// 优化结果 Diff 抽屉：负责调流式 API、展示原文/新文对比、提供接受/重试/关闭
import { useEffect, useRef, useState } from 'react'
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
import { SENIORITY_LEVELS, type OptimizationResult, type SectionType, type SeniorityLevel } from './types'

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
  const abortRef = useRef<(() => void) | null>(null)

  // 打开时自动触发一次优化
  useEffect(() => {
    if (open) {
      runOptimize()
    } else {
      // 关闭时清空旧结果，防止下次打开闪烁
      abortRef.current?.()
      abortRef.current = null
      setPhase('idle')
      setRawStream('')
      setResult(null)
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function runOptimize() {
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
    }

    abortRef.current = optimizeStream(req, {
      onProgress: acc => setRawStream(acc),
      onDone: acc => {
        const parsed = parseStreamedResult(acc)
        setResult(parsed)
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
      const parsed = parseStreamedResult(rawStream)
      setResult(parsed)
      setPhase('done')
    } else {
      setPhase('idle')
    }
  }

  function accept() {
    if (result) {
      onAccept(result)
      onOpenChange(false)
    }
  }

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
          <button
            onClick={() => onOpenChange(false)}
            className="rounded p-1 hover:bg-[var(--color-accent)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* 与目标岗位 + 级别匹配的核心能力词 */}
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
        <div className="grid flex-1 gap-3 overflow-hidden md:grid-cols-2">
          <DiffPanel label="原文" content={originalContent} sectionType={sectionType} muted />
          <DiffPanel
            label={phase === 'streaming' ? '生成中…' : '优化后'}
            content={result?.optimizedContent ?? rawStream}
            sectionType={sectionType}
            streaming={phase === 'streaming'}
            isStructuredFallback={phase === 'streaming'}
          />
        </div>

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
            <Button variant="outline" size="sm" onClick={runOptimize}>
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button
            size="lg"
            disabled={!result || phase !== 'done'}
            onClick={accept}
            className="shadow-md"
          >
            {phase === 'streaming' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            接受并写回
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

/**
 * Diff 子面板：根据 sectionType 渲染不同样式。
 * - SELF_INTRO 是纯文本，直接展示
 * - WORK / PROJECT 是 JSON 字符串，反序列化后逐字段展示；解析失败时退回原始字符串
 * 流式期间右侧仍是不完整 JSON，用 streaming 标志直接展示原始文本，避免反复解析报错
 */
function DiffPanel({
  label,
  content,
  sectionType,
  muted,
  streaming,
  isStructuredFallback,
}: {
  label: string
  content: string
  sectionType: SectionType
  muted?: boolean
  streaming?: boolean
  isStructuredFallback?: boolean
}) {
  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden rounded-md border',
        muted ? 'bg-[var(--color-muted)]/30' : 'bg-[var(--color-background)]',
      )}
    >
      <div className="flex items-center justify-between border-b bg-[var(--color-card)] px-3 py-1.5">
        <span className="text-xs font-medium">{label}</span>
        {streaming && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-primary)]" />}
      </div>
      <div className="flex-1 overflow-auto px-3 py-2 text-sm">
        {sectionType === 'SELF_INTRO' ? (
          <p className="whitespace-pre-wrap">{content || '（空）'}</p>
        ) : streaming || isStructuredFallback ? (
          <pre className="whitespace-pre-wrap text-xs text-[var(--color-muted-foreground)]">
            {content}
          </pre>
        ) : (
          <StructuredView content={content} sectionType={sectionType} />
        )}
      </div>
    </div>
  )
}

function StructuredView({ content, sectionType }: { content: string; sectionType: SectionType }) {
  if (!content) return <span className="text-[var(--color-muted-foreground)]">（空）</span>
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(content)
  } catch {
    return <pre className="whitespace-pre-wrap text-xs">{content}</pre>
  }
  if (!parsed) return null

  if (sectionType === 'WORK') {
    return (
      <div className="space-y-2">
        <Row label="公司" value={parsed.company} />
        <Row label="职位" value={parsed.role} />
        <Row label="时间" value={parsed.period} />
        <BulletRow label="内容" value={parsed.responsibilities} />
        <BulletRow label="业绩" value={parsed.achievements} />
      </div>
    )
  }
  // PROJECT
  return (
    <div className="space-y-2">
      <Row label="项目" value={parsed.name} />
      <Row label="角色" value={parsed.role} />
      <Row label="时间" value={parsed.period} />
      <Row label="描述" value={parsed.description} multiline />
      <BulletRow label="内容" value={parsed.responsibilities} />
      <BulletRow label="业绩" value={parsed.achievements} />
    </div>
  )
}

function Row({ label, value, multiline }: { label: string; value: unknown; multiline?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{label}</div>
      <div className={multiline ? 'whitespace-pre-wrap' : 'truncate'}>{String(value ?? '')}</div>
    </div>
  )
}

function BulletRow({ label, value }: { label: string; value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null
  return (
    <div>
      <div className="text-[11px] font-medium text-[var(--color-muted-foreground)]">{label}</div>
      <ul className="space-y-0.5">
        {value.map((item, i) => (
          <li key={i} className="pl-3 relative text-[13px]">
            <span className="absolute left-0 text-[var(--color-primary)]">·</span>
            {String(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}
