import { Check } from 'lucide-react'

export function StageDot({ state }: { state: 'done' | 'active' | 'empty' }) {
  if (state === 'done') {
    return <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><Check className="h-3 w-3" /></span>
  }
  if (state === 'active') {
    return <span className="grid h-5 w-5 place-items-center rounded-full border-2 border-violet-500 bg-violet-50 dark:bg-violet-950"><span className="h-1.5 w-1.5 rounded-full bg-violet-500" /></span>
  }
  return <span className="h-5 w-5 rounded-full border border-dashed border-[var(--color-border)] bg-[var(--color-background)]" />
}

export function formatLifecycleTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(new Date(timestamp))
}

export function formatCompactTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(timestamp))
}
