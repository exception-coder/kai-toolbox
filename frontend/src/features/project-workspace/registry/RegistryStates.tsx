import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { readinessLabels, type Readiness } from './types'

export function ReadinessLabel({ state }: { state: Readiness }) {
  return <span className={cn('inline-flex items-center gap-2 whitespace-nowrap text-xs',
    state === 'AI_READY' ? 'text-[var(--color-success)]' : state === 'FAILED' ? 'text-[var(--color-destructive)]' : 'text-[var(--color-muted-foreground)]')}>
    {state === 'INITIALIZING' ? <Loader2 className="size-3 animate-spin" /> : <span className="size-1.5 rounded-full bg-current" />}
    {readinessLabels[state]}
  </span>
}

export function RegistryError({ error, retry }: { error: unknown; retry?: () => void }) {
  if (!error) return null
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-[var(--color-destructive)] py-3 pl-4 text-sm">
    <span>{error instanceof Error ? error.message : '请求失败，请重试'}</span>
    {retry && <Button variant="outline" size="sm" onClick={retry}>重试</Button>}
  </div>
}
