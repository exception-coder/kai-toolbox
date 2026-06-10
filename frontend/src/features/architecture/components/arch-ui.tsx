// 架构页可复用 UI 组件（提炼自 ai-secretary 架构页的风格）：各模块「实现原理」页共用。
import type { ComponentType, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { ArrowRight, ArrowDown, CheckCircle2, LifeBuoy, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export type Icon = ComponentType<LucideProps>
export type Tone = 'default' | 'primary' | 'muted' | 'accent' | 'danger'

export function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: Icon
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

const TONES: Record<Tone, string> = {
  default: 'border bg-[var(--color-card)]',
  primary: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10',
  muted: 'border bg-[var(--color-muted)]',
  accent: 'border-emerald-500/40 bg-emerald-500/10',
  danger: 'border-[var(--color-destructive)]/40 bg-[var(--color-destructive)]/10',
}

export type Step = { icon?: Icon; title: string; desc?: string; tone?: Tone }

export function FlowBox({ icon: Icon, title, desc, tone = 'default', className }: Step & { className?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col gap-1 rounded-lg px-3 py-2.5 text-center', TONES[tone], className)}>
      <div className="flex items-center justify-center gap-1.5 text-sm font-medium">
        {Icon && <Icon className="h-4 w-4 shrink-0" />}
        <span className="truncate">{title}</span>
      </div>
      {desc && <div className="text-xs leading-snug text-[var(--color-muted-foreground)]">{desc}</div>}
    </div>
  )
}

/** 横向流程：步骤间插箭头，移动端竖排 + 向下箭头。 */
export function HFlow({ steps }: { steps: Step[] }) {
  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
      {steps.map((s, i) => (
        <div key={i} className="contents">
          <FlowBox {...s} />
          {i < steps.length - 1 && (
            <>
              <ArrowRight className="mx-auto hidden h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] sm:block" />
              <ArrowDown className="mx-auto block h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] sm:hidden" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

/** 竖向流程：每个 FlowBox 之间插向下箭头。 */
export function VFlow({ steps }: { steps: Step[] }) {
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i}>
          <FlowBox {...s} />
          {i < steps.length - 1 && (
            <ArrowDown className="mx-auto h-4 w-4 text-[var(--color-muted-foreground)]" />
          )}
        </div>
      ))}
    </div>
  )
}

/** 图标 + 标题 + 说明 的小卡片（要点 / 知识映射）。 */
export function InfoCard({ icon: Icon, title, detail }: { icon: Icon; title: string; detail: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-primary)]">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">{detail}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export type Opt = { name: string; reason: string }
export type Decision = { topic: string; chosen: Opt; fallback?: Opt; rejected?: Opt[] }

/** 选型决策卡：选用高亮 / 降级备选 / 被筛除置灰 + 原因。 */
export function DecisionCard({ d }: { d: Decision }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{d.topic}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{d.chosen.name}</span>
              <Badge variant="success">选用</Badge>
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">{d.chosen.reason}</div>
          </div>
        </div>
        {d.fallback && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            <LifeBuoy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{d.fallback.name}</span>
                <Badge variant="outline">降级备选</Badge>
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">{d.fallback.reason}</div>
            </div>
          </div>
        )}
        {(d.rejected ?? []).map(r => (
          <div key={r.name} className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 opacity-55">
            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-[var(--color-muted-foreground)] line-through">{r.name}</span>
                <Badge variant="outline" className="text-[var(--color-muted-foreground)]">筛除</Badge>
              </div>
              <div className="text-xs text-[var(--color-muted-foreground)]">✗ {r.reason}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

/** 代码块：标题 + 语言标签 + 等宽可横滚的简化代码。 */
export function CodeBlock({ title, lang, code }: { title?: string; lang?: string; code: string }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-[var(--color-card)]">
      {(title || lang) && (
        <div className="flex items-center justify-between gap-2 border-b bg-[var(--color-muted)]/40 px-3 py-1.5 text-xs">
          {title && <span className="font-medium">{title}</span>}
          {lang && <span className="shrink-0 text-[var(--color-muted-foreground)]">{lang}</span>}
        </div>
      )}
      <pre className="overflow-x-auto px-3 py-2.5 font-mono text-[11.5px] leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  )
}

/** 编号风险 → 防护 的小卡。 */
export function GuardCard({ tag, risk, guard }: { tag: string; risk: string; guard: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)]/15 text-xs font-semibold text-[var(--color-primary)]">
          {tag}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{risk}</div>
          <div className="text-xs text-[var(--color-muted-foreground)]">{guard}</div>
        </div>
      </CardContent>
    </Card>
  )
}
