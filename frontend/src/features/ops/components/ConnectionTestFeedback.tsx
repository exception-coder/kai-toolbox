import { CheckCircle2, LoaderCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TestResult } from '../types'

/** 反馈留在发起测试的实例旁，避免被长列表挤出当前操作区域。 */
export function ConnectionTestFeedback({ testing, result }: { testing: boolean; result: TestResult | null }) {
  if (!testing && !result) return null
  const failed = !testing && result?.ok === false
  const Icon = testing ? LoaderCircle : failed ? XCircle : CheckCircle2
  return (
    <div role={failed ? 'alert' : 'status'} aria-atomic="true" className={cn(
      'mt-2 flex items-start gap-2 text-xs leading-5',
      testing ? 'text-muted-foreground' : failed ? 'text-destructive' : 'text-emerald-700 dark:text-emerald-300',
    )}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', testing && 'animate-spin motion-reduce:animate-none')} />
      <span className="min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {testing ? '正在测试连接…' : <>
          {failed ? '连接失败' : '连接成功'}
          {!!result && (result.ok || result.elapsedMs > 0) && ` · ${result.elapsedMs} ms`}
          {result?.message && `：${result.message}`}
        </>}
      </span>
    </div>
  )
}
