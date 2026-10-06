import { useQuery } from '@tanstack/react-query'
import { Minimize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getSessionAutopilot } from '../api'

export function FocusReadingHeader({ title, sessionId, wide, onToggleWidth, onExit }: {
  title: string; sessionId: string | null; wide: boolean; onToggleWidth: () => void; onExit: () => void
}) {
  const binding = useQuery({
    queryKey: ['claude-chat-autopilot', sessionId],
    queryFn: () => getSessionAutopilot(sessionId!),
    enabled: Boolean(sessionId), staleTime: 4_000, refetchInterval: 15_000,
  })
  const run = binding.data
  return <div className="cc-focus-header shrink-0 border-b border-[var(--color-border)]">
    <div className="cc-focus-header-inner flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={title}>{title}</p>
        <p role="status" className="truncate text-xs text-[var(--color-muted-foreground)]" title={run?.changeId}>
          {binding.isError ? '规格上下文暂无法获取' : run
            ? `OpenSpec · ${run.changeId}${run.currentTaskId ? ` · Task ${run.currentTaskId}` : ''}`
            : binding.isPending && sessionId ? '正在读取规格上下文…' : '未绑定 OpenSpec'}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" className="min-h-11 text-xs" aria-pressed={wide} onClick={onToggleWidth}
          title={wide ? '恢复 860px 阅读宽度' : '扩展到 960px，适合代码与表格'}>{wide ? '标准宽度' : '宽版阅读'}</Button>
        <Button variant="ghost" className="min-h-11" onClick={onExit} aria-label="退出专注模式">
          <Minimize2 className="size-4" />退出专注 <span className="hidden text-xs text-[var(--color-muted-foreground)] sm:inline">Esc</span>
        </Button>
      </div>
    </div>
  </div>
}
