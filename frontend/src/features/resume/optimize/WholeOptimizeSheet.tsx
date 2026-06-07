// 整篇优化抽屉：一次把整张简历交给后端 /optimize/whole，返回多段建议，
// 用户逐段勾选「采纳」，确认后一次性写回主状态。
import { useEffect, useState } from 'react'
import { CheckCircle2, Loader2, RefreshCw, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { optimizeWhole } from './api'
import { SENIORITY_LEVELS, type JobContext, type WholeSectionResult } from './types'
import type { ProjectExperience, ResumeData, WorkExperience } from '../types'

export interface WholeOptimizeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: ResumeData
  job: JobContext
  /** 用户确认采纳后，写回整张简历 */
  onApply: (next: ResumeData) => void
}

type Phase = 'idle' | 'loading' | 'done' | 'error'

export function WholeOptimizeSheet({ open, onOpenChange, data, job, onApply }: WholeOptimizeSheetProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [sections, setSections] = useState<WholeSectionResult[]>([])
  const [accepted, setAccepted] = useState<Record<number, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      run()
    } else {
      setPhase('idle')
      setSections([])
      setAccepted({})
      setError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function run() {
    setPhase('loading')
    setSections([])
    setAccepted({})
    setError(null)
    optimizeWhole({
      resumeJson: JSON.stringify(data),
      targetRole: job.targetRole,
      experienceYears: job.experienceYears,
      seniorityLevel: job.seniorityLevel,
    })
      .then(res => {
        const list = res.sections ?? []
        setSections(list)
        // 默认全部勾选
        setAccepted(Object.fromEntries(list.map((_, i) => [i, true])))
        setPhase('done')
      })
      .catch(e => {
        setError(e instanceof Error ? e.message : String(e))
        setPhase('error')
      })
  }

  function applySelected() {
    const picked = sections.filter((_, i) => accepted[i])
    if (picked.length > 0) {
      onApply(applySections(data, picked))
    }
    onOpenChange(false)
  }

  const acceptedCount = sections.filter((_, i) => accepted[i]).length

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
              AI 整篇优化
            </SheetTitle>
            <SheetDescription>
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span>定位：</span>
                <span className="rounded-md border bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">{job.targetRole}</span>
                {job.seniorityLevel && (
                  <span className="rounded-md border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-xs text-[var(--color-primary)]">
                    {SENIORITY_LEVELS[job.seniorityLevel].label}
                    {job.experienceYears != null && ` · ${job.experienceYears} 年`}
                  </span>
                )}
              </span>
            </SheetDescription>
          </div>
          <button onClick={() => onOpenChange(false)} className="rounded p-1 hover:bg-[var(--color-accent)]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          {phase === 'loading' && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-[var(--color-muted-foreground)]">
              <Loader2 className="h-5 w-5 animate-spin text-[var(--color-primary)]" />
              正在通读整张简历并统筹优化…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/5 px-3 py-2 text-xs text-[var(--color-destructive)]">
              {error}
            </div>
          )}

          {phase === 'done' && sections.length === 0 && (
            <div className="flex h-40 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
              模型未给出可采纳的优化建议（可能内容已较完善，或返回格式异常）。
            </div>
          )}

          {phase === 'done' && sections.length > 0 && (
            <div className="space-y-3">
              {sections.map((s, i) => (
                <SectionCard
                  key={i}
                  result={s}
                  title={titleOf(s, data)}
                  original={originalOf(s, data)}
                  checked={!!accepted[i]}
                  onToggle={() => setAccepted(a => ({ ...a, [i]: !a[i] }))}
                />
              ))}
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t pt-3">
          {phase !== 'loading' && (
            <Button variant="outline" size="sm" onClick={run}>
              <RefreshCw className="h-3.5 w-3.5" />
              重新生成
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button size="lg" disabled={phase !== 'done' || acceptedCount === 0} onClick={applySelected} className="shadow-md">
            <CheckCircle2 className="h-4 w-4" />
            采纳选中（{acceptedCount}）并写回
          </Button>
        </footer>
      </SheetContent>
    </Sheet>
  )
}

function SectionCard({
  result,
  title,
  original,
  checked,
  onToggle,
}: {
  result: WholeSectionResult
  title: string
  original: string
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className={cn('rounded-lg border', checked ? 'border-[var(--color-primary)]/40' : 'opacity-70')}>
      <div className="flex items-center justify-between gap-2 border-b bg-[var(--color-card)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 text-[11px] text-[var(--color-primary)]">
            {sectionLabel(result.sectionType)}
          </span>
          <span className="truncate">{title}</span>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs">
          <input type="checkbox" checked={checked} onChange={onToggle} className="accent-[var(--color-primary)]" />
          采纳
        </label>
      </div>
      <div className="grid gap-3 p-3 md:grid-cols-2">
        <FieldBlock label="原文" content={original} sectionType={result.sectionType} muted />
        <FieldBlock label="优化后" content={result.optimizedContent} sectionType={result.sectionType} />
      </div>
      {result.changeNotes.length > 0 && (
        <details className="border-t px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">关键改动（{result.changeNotes.length}）</summary>
          <ul className="mt-2 space-y-1 text-[var(--color-muted-foreground)]">
            {result.changeNotes.map((n, i) => (
              <li key={i} className="relative pl-3">
                <span className="absolute left-0">·</span>
                {n}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function FieldBlock({
  label,
  content,
  sectionType,
  muted,
}: {
  label: string
  content: string
  sectionType: WholeSectionResult['sectionType']
  muted?: boolean
}) {
  return (
    <div className={cn('rounded-md border p-2', muted ? 'bg-[var(--color-muted)]/30' : 'bg-[var(--color-background)]')}>
      <div className="mb-1 text-[11px] font-medium text-[var(--color-muted-foreground)]">{label}</div>
      {sectionType === 'SELF_INTRO' ? (
        <p className="whitespace-pre-wrap text-sm">{content || '（空）'}</p>
      ) : (
        <StructuredView content={content} sectionType={sectionType} />
      )}
    </div>
  )
}

function StructuredView({ content, sectionType }: { content: string; sectionType: 'WORK' | 'PROJECT' | 'SELF_INTRO' }) {
  if (!content) return <span className="text-sm text-[var(--color-muted-foreground)]">（空）</span>
  let parsed: Record<string, unknown> | null = null
  try {
    parsed = JSON.parse(content)
  } catch {
    return <pre className="whitespace-pre-wrap text-xs">{content}</pre>
  }
  if (!parsed) return null
  if (sectionType === 'WORK') {
    return (
      <div className="space-y-1.5 text-sm">
        <Line label="公司" value={parsed.company} />
        <Line label="职位" value={parsed.role} />
        <Bullets label="内容" value={parsed.responsibilities} />
        <Bullets label="业绩" value={parsed.achievements} />
      </div>
    )
  }
  return (
    <div className="space-y-1.5 text-sm">
      <Line label="项目" value={parsed.name} />
      <Line label="角色" value={parsed.role} />
      <Line label="描述" value={parsed.description} />
      <Bullets label="内容" value={parsed.responsibilities} />
      <Bullets label="业绩" value={parsed.achievements} />
    </div>
  )
}

function Line({ label, value }: { label: string; value: unknown }) {
  if (!value) return null
  return (
    <div>
      <span className="text-[11px] text-[var(--color-muted-foreground)]">{label}：</span>
      <span className="whitespace-pre-wrap">{String(value)}</span>
    </div>
  )
}

function Bullets({ label, value }: { label: string; value: unknown }) {
  if (!Array.isArray(value) || value.length === 0) return null
  return (
    <div>
      <div className="text-[11px] text-[var(--color-muted-foreground)]">{label}</div>
      <ul className="space-y-0.5">
        {value.map((item, i) => (
          <li key={i} className="relative pl-3 text-[13px]">
            <span className="absolute left-0 text-[var(--color-primary)]">·</span>
            {String(item)}
          </li>
        ))}
      </ul>
    </div>
  )
}

function sectionLabel(t: WholeSectionResult['sectionType']): string {
  switch (t) {
    case 'WORK':
      return '工作经历'
    case 'PROJECT':
      return '项目经历'
    case 'SELF_INTRO':
      return '个人优势'
  }
}

/** 解析该段对应的原文，用于左侧对比展示 */
function originalOf(s: WholeSectionResult, data: ResumeData): string {
  if (s.sectionType === 'SELF_INTRO') return data.basics.advantage
  if (s.sectionType === 'WORK') {
    const w = data.work.find(x => x.id === s.itemId)
    return w ? JSON.stringify({ company: w.company, role: w.role, period: w.period, responsibilities: w.responsibilities, achievements: w.achievements }) : ''
  }
  const p = data.projects.find(x => x.id === s.itemId)
  return p ? JSON.stringify({ name: p.name, role: p.role, period: p.period, description: p.description, responsibilities: p.responsibilities, achievements: p.achievements }) : ''
}

function titleOf(s: WholeSectionResult, data: ResumeData): string {
  if (s.sectionType === 'SELF_INTRO') return '个人优势'
  if (s.sectionType === 'WORK') {
    const w = data.work.find(x => x.id === s.itemId)
    return w ? `${w.company}${w.role ? ' · ' + w.role : ''}` : '（已删除条目）'
  }
  const p = data.projects.find(x => x.id === s.itemId)
  return p ? `${p.name}${p.role ? ' · ' + p.role : ''}` : '（已删除条目）'
}

/** 把选中的多段建议合并写回整张简历 */
function applySections(data: ResumeData, picked: WholeSectionResult[]): ResumeData {
  let basics = data.basics
  let work = data.work
  let projects = data.projects
  for (const s of picked) {
    if (s.sectionType === 'SELF_INTRO') {
      basics = { ...basics, advantage: s.optimizedContent }
    } else if (s.sectionType === 'WORK' && s.itemId) {
      work = work.map(w => (w.id === s.itemId ? mergeWork(w, s.optimizedContent) : w))
    } else if (s.sectionType === 'PROJECT' && s.itemId) {
      projects = projects.map(p => (p.id === s.itemId ? mergeProject(p, s.optimizedContent) : p))
    }
  }
  return { ...data, basics, work, projects }
}

function mergeWork(item: WorkExperience, optimizedContent: string): WorkExperience {
  try {
    const parsed = JSON.parse(optimizedContent)
    return {
      ...item,
      company: typeof parsed.company === 'string' ? parsed.company : item.company,
      role: typeof parsed.role === 'string' ? parsed.role : item.role,
      period: typeof parsed.period === 'string' ? parsed.period : item.period,
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map((s: unknown) => String(s)) : item.responsibilities,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.map((s: unknown) => String(s)) : item.achievements,
    }
  } catch (e) {
    console.error('[resume] 整篇 WORK 写回失败', e)
    return item
  }
}

function mergeProject(item: ProjectExperience, optimizedContent: string): ProjectExperience {
  try {
    const parsed = JSON.parse(optimizedContent)
    return {
      ...item,
      name: typeof parsed.name === 'string' ? parsed.name : item.name,
      role: typeof parsed.role === 'string' ? parsed.role : item.role,
      period: typeof parsed.period === 'string' ? parsed.period : item.period,
      description: typeof parsed.description === 'string' ? parsed.description : item.description,
      responsibilities: Array.isArray(parsed.responsibilities) ? parsed.responsibilities.map((s: unknown) => String(s)) : item.responsibilities,
      achievements: Array.isArray(parsed.achievements) ? parsed.achievements.map((s: unknown) => String(s)) : item.achievements,
    }
  } catch (e) {
    console.error('[resume] 整篇 PROJECT 写回失败', e)
    return item
  }
}
