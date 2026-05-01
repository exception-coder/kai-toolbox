import { Link } from 'react-router-dom'
import { ArrowRight, Boxes } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { entryOf, features } from './featureRegistry'

export function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Boxes className="h-7 w-7 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">kai-toolbox</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">个人工具集</p>
        </div>
      </div>

      {features.length === 0 ? (
        <div className="rounded-md border border-dashed bg-[var(--color-card)] p-10 text-center text-sm text-[var(--color-muted-foreground)]">
          还没有任何工具。在 <code className="rounded bg-[var(--color-muted)] px-1 py-0.5">src/features/</code> 下新建一个 feature manifest 即可。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(f => {
            const Icon = f.icon
            return (
              <Link key={f.id} to={entryOf(f)} className="group">
                <Card className="h-full transition-shadow group-hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between text-base">
                      <span className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                        {f.name}
                      </span>
                      <ArrowRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
                    </CardTitle>
                    {f.description && <CardDescription>{f.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="text-xs text-[var(--color-muted-foreground)]">
                    {f.group ?? '通用'}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
