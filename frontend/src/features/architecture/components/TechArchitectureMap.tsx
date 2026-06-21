import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'blue' | 'orange' | 'green' | 'purple' | 'cyan' | 'slate'

export type TechArchGroup = {
  title: string
  tone: Tone
  nodes: string[]
}

export type TechArchitectureMapProps = {
  title: string
  subtitle: string
  top: string[]
  clients: string[]
  left: string[]
  right: string[]
  groups: TechArchGroup[]
  bottom: string[]
  footer?: string
}

const toneClasses: Record<Tone, { border: string; text: string; ring: string }> = {
  blue: { border: 'border-blue-500', text: 'text-blue-300', ring: 'border-blue-500/70' },
  orange: { border: 'border-orange-500', text: 'text-orange-300', ring: 'border-orange-500/70' },
  green: { border: 'border-lime-500', text: 'text-lime-300', ring: 'border-lime-500/70' },
  purple: { border: 'border-fuchsia-500', text: 'text-fuchsia-300', ring: 'border-fuchsia-500/70' },
  cyan: { border: 'border-cyan-500', text: 'text-cyan-300', ring: 'border-cyan-500/70' },
  slate: { border: 'border-slate-500', text: 'text-slate-300', ring: 'border-slate-500/70' },
}

function HatchNode({
  children,
  tone = 'slate',
  className,
}: {
  children: string
  tone?: Tone
  className?: string
}) {
  const style = toneClasses[tone]
  return (
    <div
      className={cn(
        'flex min-h-10 items-center justify-center rounded-xl border px-4 py-2 text-center text-sm font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.05)]',
        'bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.20)_0_2px,rgba(255,255,255,0.03)_2px_7px)]',
        style.border,
        style.text,
        className,
      )}
    >
      {children}
    </div>
  )
}

function Rail({ items, side }: { items: string[]; side: 'left' | 'right' }) {
  return (
    <div className={cn('flex flex-col gap-4', side === 'left' ? 'items-start' : 'items-end')}>
      {items.map(item => (
        <HatchNode key={item} className="w-36 text-slate-300">
          {item}
        </HatchNode>
      ))}
    </div>
  )
}

export function TechArchitectureMap({
  title,
  subtitle,
  top,
  clients,
  left,
  right,
  groups,
  bottom,
  footer,
}: TechArchitectureMapProps) {
  return (
    <Card className="overflow-hidden border-[var(--color-primary)]/25">
      <CardHeader className="border-b bg-[var(--color-muted)]/25 pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <span>{title}</span>
          <Badge variant="outline">技术架构图</Badge>
        </CardTitle>
        <p className="text-sm text-[var(--color-muted-foreground)]">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[980px] bg-black px-8 py-8 text-slate-400">
            <div className="grid grid-cols-4 gap-10">
              {top.map(item => (
                <HatchNode key={item}>{item}</HatchNode>
              ))}
            </div>

            <div className="mt-4 flex justify-center">
              <div className="grid w-[54rem] grid-cols-3 gap-8">
                {clients.slice(0, 3).map(item => (
                  <HatchNode key={item} tone="blue">
                    {item}
                  </HatchNode>
                ))}
              </div>
            </div>
            <div className="mt-3 flex justify-center text-sm font-semibold text-slate-600">入口 / SDK / 网关层</div>
            {clients.length > 3 && (
              <div className="mt-4 flex justify-center">
                <div className="grid w-[38rem] grid-cols-2 gap-8">
                  {clients.slice(3).map(item => (
                    <HatchNode key={item} tone="blue">
                      {item}
                    </HatchNode>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-12 grid grid-cols-[10rem_1fr_10rem] gap-6">
              <Rail items={left} side="left" />
              <div className="grid grid-cols-4 gap-4">
                {groups.map(group => {
                  const style = toneClasses[group.tone]
                  return (
                    <div
                      key={group.title}
                      className={cn(
                        'min-h-64 rounded-2xl border-2 border-dashed p-4',
                        style.ring,
                      )}
                    >
                      <div className={cn('mb-4 text-center text-sm font-bold', style.text)}>{group.title}</div>
                      <div className="flex flex-col gap-4">
                        {group.nodes.map(node => (
                          <HatchNode key={node} tone={group.tone}>
                            {node}
                          </HatchNode>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              <Rail items={right} side="right" />
            </div>

            <div className="mt-10 grid grid-cols-6 gap-5">
              {bottom.map(item => (
                <HatchNode key={item} tone="blue" className="min-h-9 text-xs">
                  {item}
                </HatchNode>
              ))}
            </div>

            {footer && (
              <div className="mt-14 text-center text-4xl font-black tracking-wide text-slate-700">
                {footer}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
