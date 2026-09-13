import { Button } from '@/components/ui/button'

interface Props {
  error: Error | null
  loading: boolean
  unavailable: string | null
  onRetry: () => void
}

export function EvaluationRecovery({ error, loading, unavailable, onRetry }: Props) {
  if (error) return <div role="alert" className="border-l-2 border-[var(--color-danger)] pl-4 text-sm">
    <p className="font-medium">评测数据加载失败</p>
    <p className="mt-1 break-words text-[var(--color-muted-foreground)]">{error.message}</p>
    <Button className="mt-3" variant="outline" size="sm" onClick={onRetry}>重试加载评测</Button>
  </div>
  if (loading) return <p role="status" className="text-sm text-[var(--color-muted-foreground)]">正在读取评测数据…</p>
  if (!unavailable) return null
  return <div role="status" className="border-l-2 border-[var(--color-border)] pl-4 text-sm">
    <p>{unavailable}</p>
    <a className="mt-2 inline-block underline underline-offset-4" href="#evaluation-sources">检查样本来源</a>
  </div>
}
