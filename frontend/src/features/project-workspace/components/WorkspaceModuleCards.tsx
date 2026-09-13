import type { ReactNode } from 'react'
import { Boxes, Loader2, Pin, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { AggregationItem } from '../hooks/useAggregationCart'

export function StateLine({ text, icon, tone = 'muted' }: { text: string; icon?: ReactNode; tone?: 'muted' | 'danger' }) {
  return (
    <div
      className={cn(
        'flex min-h-28 items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm',
        tone === 'danger' ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]',
      )}
    >
      {icon}
      <span>{text}</span>
    </div>
  )
}

/** 待聚合篮子面板：按项目分组展示已钉模块，可移除/清空/一键聚合。 */
export function AggregationCart({
  items,
  aggregating,
  error,
  onRemove,
  onClear,
  onAggregate,
}: {
  items: AggregationItem[]
  aggregating: boolean
  error: string
  onRemove: (modulePath: string) => void
  onClear: () => void
  onAggregate: () => void
}) {
  const projectCount = new Set(items.map(i => i.projectPath)).size
  const grouped = new Map<string, AggregationItem[]>()
  for (const it of items) {
    const arr = grouped.get(it.projectName) ?? []
    arr.push(it)
    grouped.set(it.projectName, arr)
  }
  return (
    <Card className="border-[var(--color-primary)]/40 bg-[var(--color-primary)]/5">
      <CardHeader className="gap-1 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pin className="h-4 w-4 fill-current" />
          待聚合模块（{items.length}）
        </CardTitle>
        <CardDescription>
          跨项目钉选模块，一键软链各自项目根为合并工作区联动开发；聚合后自动带上联动提示。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {[...grouped.entries()].map(([proj, mods]) => (
            <div key={proj} className="min-w-0 rounded-md border bg-[var(--color-background)] px-2.5 py-1.5">
              <div className="mb-1 truncate text-xs font-medium text-[var(--color-foreground)]">{proj}</div>
              <div className="flex flex-wrap gap-1">
                {mods.map(m => (
                  <span key={m.modulePath} className="inline-flex items-center gap-1 rounded bg-[var(--color-muted)] px-1.5 py-0.5 text-xs">
                    {m.moduleName}
                    <button type="button" onClick={() => onRemove(m.modulePath)} aria-label={`移除 ${m.moduleName}`}
                      className="text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
        {error ? <p className="text-xs text-[var(--color-destructive)]">{error}</p> : null}
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={onAggregate} disabled={aggregating || items.length < 1}>
            {aggregating ? <Loader2 className="animate-spin" /> : <Boxes />}
            一键聚合（{projectCount} 个项目）
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClear} disabled={aggregating}>
            <Trash2 />清空
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
