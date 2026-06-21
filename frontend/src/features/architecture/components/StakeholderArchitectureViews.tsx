import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

type Capability = {
  title: string
  items: string[]
}

type ValueMap = {
  center: string
  top: string
  left: string
  right: string
  bottom: string
}

type BusinessMap = {
  actors: string[]
  platform: string
  capabilities: string[]
  outcomes: string[]
}

type Layer = {
  title: string
  items: string[]
}

type C4Level = {
  level: string
  audience: string
  items: string[]
}

export type StakeholderArchitectureViewsProps = {
  title: string
  summary: string
  capabilities: Capability[]
  value: ValueMap
  business: BusinessMap
  layers: Layer[]
  c4: C4Level[]
}

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

export function StakeholderArchitectureViews({
  title,
  summary,
  capabilities,
  value,
  business,
  layers,
  c4,
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">能力地图 · 领导一眼看懂做什么</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {capabilities.map(capability => <MiniBox key={capability.title} {...capability} />)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">价值架构图 · 总监看结果</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-center text-sm">
              <div />
              <div className="rounded-lg border bg-emerald-500/10 px-4 py-2 font-semibold text-emerald-700 dark:text-emerald-300">
                {value.top}
              </div>
              <div />
              <div className="rounded-lg border bg-blue-500/10 px-4 py-2 font-semibold text-blue-700 dark:text-blue-300">
                {value.left}
              </div>
              <div className="rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-4 font-bold">
                {value.center}
              </div>
              <div className="rounded-lg border bg-violet-500/10 px-4 py-2 font-semibold text-violet-700 dark:text-violet-300">
                {value.right}
              </div>
              <div />
              <div className="rounded-lg border bg-amber-500/10 px-4 py-2 font-semibold text-amber-700 dark:text-amber-300">
                {value.bottom}
              </div>
              <div />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">业务全景图 · 老板看业务闭环</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-center">
            <div className="flex flex-wrap justify-center gap-2">
              {business.actors.map(actor => (
                <span key={actor} className="rounded-lg border bg-[var(--color-muted)] px-3 py-1.5 text-sm font-medium">{actor}</span>
              ))}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="mx-auto max-w-xs rounded-xl border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-5 py-3 text-base font-bold">
              {business.platform}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="flex flex-wrap justify-center gap-2">
              {business.capabilities.map(capability => (
                <span key={capability} className="rounded-lg border bg-[var(--color-card)] px-3 py-1.5 text-sm font-medium">{capability}</span>
              ))}
            </div>
            <div className="text-xs text-[var(--color-muted-foreground)]">↓</div>
            <div className="grid gap-2 sm:grid-cols-3">
              {business.outcomes.map(outcome => (
                <div key={outcome} className="rounded-lg border bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">
                  {outcome}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">分层架构图 · 汇报最稳妥</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {layers.map(layer => (
              <div key={layer.title} className="rounded-xl border bg-[var(--color-card)] p-3">
                <div className="text-sm font-semibold">{layer.title}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {layer.items.map(item => (
                    <span key={item} className="rounded-md bg-[var(--color-muted)] px-2 py-1 text-xs text-[var(--color-muted-foreground)]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">C4 视角 · 同一系统给不同角色看不同深度</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-4">
            {c4.map(level => (
              <div key={level.level} className="rounded-xl border bg-[var(--color-card)] p-3">
                <div className="text-sm font-bold">{level.level}</div>
                <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">{level.audience}</div>
                <div className="mt-3 space-y-1">
                  {level.items.map(item => (
                    <div key={item} className="rounded-md bg-[var(--color-muted)] px-2 py-1 text-xs">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
