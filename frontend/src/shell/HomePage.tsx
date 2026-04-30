import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Boxes } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { http } from '@/lib/api'
import type { ToolDescriptor } from './types'

export function HomePage() {
  const { data: tools = [] } = useQuery({
    queryKey: ['tools'],
    queryFn: () => http<ToolDescriptor[]>('/tools'),
  })

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Boxes className="h-7 w-7 text-[var(--color-primary)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">kai-toolbox</h1>
          <p className="text-sm text-[var(--color-muted-foreground)]">个人工具集</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map(t => (
          <Link key={t.id} to={t.route} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {t.name}
                  <ArrowRight className="h-4 w-4 text-[var(--color-muted-foreground)] transition-transform group-hover:translate-x-0.5" />
                </CardTitle>
                {t.description && <CardDescription>{t.description}</CardDescription>}
              </CardHeader>
              <CardContent className="text-xs text-[var(--color-muted-foreground)]">
                {t.group ?? '通用'}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
