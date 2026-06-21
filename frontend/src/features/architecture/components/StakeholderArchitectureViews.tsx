import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/* ── 基础类型 ── */

type Capability = { title: string; items: string[] }
type ValueMap = { center: string; top: string; left: string; right: string; bottom: string }
type BusinessMap = { actors: string[]; platform: string; capabilities: string[]; outcomes: string[] }
type Layer = { title: string; items: string[] }
type C4Level = { level: string; audience: string; items: string[] }

/** 业务技术全景链路图 · 每一层 */
export type ChainStep = {
  layer: string
  color: 'blue' | 'violet' | 'orange' | 'emerald' | 'rose' | 'slate' | 'amber' | 'cyan'
  items: string[]
  note?: string
}

/** 系统依赖关系图 · 一组依赖 */
export type DepGroup = {
  category: string
  color: 'blue' | 'violet' | 'orange' | 'emerald' | 'rose' | 'slate' | 'amber' | 'cyan'
  items: { name: string; note: string }[]
}

export type StakeholderArchitectureViewsProps = {
  title: string
  summary: string
  capabilities: Capability[]
  value: ValueMap
  business: BusinessMap
  layers: Layer[]
  c4: C4Level[]
  chain?: ChainStep[]
  deps?: DepGroup[]
}

/* ── 颜色映射 ── */

const COLOR: Record<string, { bg: string; badge: string; border: string; dot: string }> = {
  blue:    { bg: 'bg-blue-500/5',    badge: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',       border: 'border-blue-500/40',    dot: 'bg-blue-500' },
  violet:  { bg: 'bg-violet-500/5',  badge: 'bg-violet-500/15 text-violet-700 dark:text-violet-300', border: 'border-violet-500/40',  dot: 'bg-violet-500' },
  orange:  { bg: 'bg-orange-500/5',  badge: 'bg-orange-500/15 text-orange-700 dark:text-orange-300', border: 'border-orange-500/40',  dot: 'bg-orange-500' },
  emerald: { bg: 'bg-emerald-500/5', badge: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', border: 'border-emerald-500/40', dot: 'bg-emerald-500' },
  rose:    { bg: 'bg-rose-500/5',    badge: 'bg-rose-500/15 text-rose-700 dark:text-rose-300',       border: 'border-rose-500/40',    dot: 'bg-rose-500' },
  slate:   { bg: 'bg-slate-500/5',   badge: 'bg-slate-500/15 text-slate-700 dark:text-slate-300',    border: 'border-slate-400/40',   dot: 'bg-slate-500' },
  amber:   { bg: 'bg-amber-500/5',   badge: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',    border: 'border-amber-500/40',   dot: 'bg-amber-500' },
  cyan:    { bg: 'bg-cyan-500/5',    badge: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',       border: 'border-cyan-500/40',    dot: 'bg-cyan-500' },
}

function c(color: string) { return COLOR[color] ?? COLOR.slate }

/* ── 子组件 ── */

function MiniBox({ title, items }: Capability) {
  return (
    <div className="rounded-lg border bg-[var(--color-card)] p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-2 space-y-1 text-xs text-[var(--color-muted-foreground)]">
        {items.map(item => <div key={item}>{item}</div>)}
      </div>
    </div>
  )
}

function BizTechChain({ steps }: { steps: ChainStep[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">业务技术全景链路图</CardTitle>
          <Badge variant="outline" className="text-[10px]">汇报神器</Badge>
        </div>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          业务从哪里来 → 经过哪些系统 → 用了哪些服务 → 落到哪些数据库/中间件 → 最终输出什么结果
        </p>
      </CardHeader>
      <CardContent className="space-y-0 pb-4">
        {steps.map((step, i) => {
          const sc = c(step.color)
          return (
            <div key={step.layer}>
              <div className={cn('rounded-xl border p-3', sc.bg, sc.border)}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                  <span className={cn('inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-xs font-semibold', sc.badge)}>
                    {step.layer}
                  </span>
                  <div className="flex flex-1 flex-wrap gap-1.5">
                    {step.items.map(item => (
                      <span key={item} className="rounded border bg-[var(--color-card)] px-2 py-0.5 text-xs">
                        {item}
                      </span>
                    ))}
                    {step.note && (
                      <span className="ml-1 self-center text-[11px] text-[var(--color-muted-foreground)]">· {step.note}</span>
                    )}
                  </div>
                </div>
              </div>
              {i < steps.length - 1 && (
                <div className="flex items-center gap-2 px-4 py-1">
                  <div className={cn('h-4 w-0.5 rounded-full', c(steps[i + 1]?.color ?? 'slate').dot)} />
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">↓</span>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function SysDepsMap({ groups }: { groups: DepGroup[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">系统依赖关系图</CardTitle>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          本系统依赖了哪些数据库、外部 API、第三方服务 · 关键外部耦合一目了然
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {groups.map(g => {
            const gc = c(g.color)
            return (
              <div key={g.category} className={cn('rounded-xl border p-3', gc.bg, gc.border)}>
                <div className={cn('mb-2 text-xs font-semibold', gc.badge.split(' ').slice(1).join(' '))}>
                  {g.category}
                </div>
                <div className="space-y-1.5">
                  {g.items.map(dep => (
                    <div key={dep.name} className="rounded-md border bg-[var(--color-card)] px-2.5 py-1.5">
                      <div className="text-xs font-medium">{dep.name}</div>
                      <div className="text-[11px] text-[var(--color-muted-foreground)]">{dep.note}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/* ── 主导出 ── */

export function StakeholderArchitectureViews({
  title, summary, capabilities, value, business, layers, c4, chain, deps,
}: StakeholderArchitectureViewsProps) {
  return (
    <section className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <Badge variant="secondary">汇报视图</Badge>
        </div>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">{summary}</p>
      </div>

      {/* 业务技术全景链路图（最先展示，领导秒懂） */}
      {chain && chain.length > 0 && <BizTechChain steps={chain} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">能力地图 · 领导一眼看懂做什么</CardTitle></CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {capabilities.map(cap => <MiniBox key={cap.title} {...cap} />)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">价值架构图 · 总监看结果</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center text-sm">
              <div /><div className="rounded-lg border bg-emerald-500/10 px-4 py-2 font-semibold text-emerald-700 dark:text-emerald-300">{value.top}</div><div />
              <div className="rounded-lg border bg-blue-500/10 px-4 py-2 font-semibold text-blue-700 dark:text-blue-300">{value.left}</div>
              <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-4 font-bold">{value.center}</div>
              <div className="rounded-lg border bg-violet-500/10 px-4 py-2 font-semibold text-violet-700 dark:text-violet-300">{value.right}</div>
              <div /><div className="rounded-lg border bg-amber-500/10 px-4 py-2 font-semibold text-amber-700 dark:text-amber-300">{value.bottom}</div><div />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">业务全景图 · 老板看业务闭环</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-center">
            <div className="flex flex-wrap justify-center gap-2">
              {business.actors.map(a => <span key={a} className="rounded-lg border bg-[var(--color-muted)] px-3 py-1.5 text-sm font-medium">{a}</span>)}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="mx-auto max-w-xs rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-3 text-base font-bold">{business.platform}</div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="flex flex-wrap justify-center gap-2">
              {business.capabilities.map(cap => <span key={cap} className="rounded-lg border bg-[var(--color-card)] px-3 py-1.5 text-sm font-medium">{cap}</span>)}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {business.outcomes.map(o => <div key={o} className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{o}</div>)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">分层架构图 · 汇报最稳妥</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {layers.map(layer => (
              <div key={layer.title} className="rounded-xl border bg-[var(--color-card)] p-3">
                <div className="text-sm font-semibold">{layer.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {layer.items.map(item => <span key={item} className="rounded-md bg-[var(--color-muted)] px-2 py-1 text-xs text-[var(--color-muted-foreground)]">{item}</span>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">C4 视角 · 同一系统给不同角色看不同深度</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {c4.map(level => (
              <div key={level.level} className="rounded-xl border bg-[var(--color-card)] p-3">
                <div className="text-sm font-bold">{level.level}</div>
                <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{level.audience}</div>
                <div className="mt-3 space-y-1">
                  {level.items.map(item => <div key={item} className="rounded-md bg-[var(--color-muted)] px-2 py-1 text-xs">{item}</div>)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 系统依赖关系图（可选） */}
      {deps && deps.length > 0 && <SysDepsMap groups={deps} />}
    </section>
  )
}
