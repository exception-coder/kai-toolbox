// 「AI 整篇优化」入口按钮：触发 useOptimize().openWhole()，一次统筹优化整张简历。
import { Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOptimize } from './OptimizeContext'

interface Props {
  className?: string
}

export function WholeOptimizeButton({ className }: Props) {
  const { openWhole, hasJobIntent } = useOptimize()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={openWhole}
      disabled={!hasJobIntent}
      className={cn(
        'gap-1.5',
        hasJobIntent
          ? 'border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
          : 'opacity-70',
        className,
      )}
      title={hasJobIntent ? '通读整张简历，跨段统筹优化，逐段采纳' : '请先在基本信息里填写「求职意向」'}
    >
      <Wand2 className="h-3.5 w-3.5" />
      AI 整篇优化
    </Button>
  )
}
