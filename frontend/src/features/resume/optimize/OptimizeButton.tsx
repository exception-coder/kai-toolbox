// 简历各 section 共用的「AI 优化」按钮：极薄，只是 useOptimize().open(target)
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useOptimize, type OptimizeTarget } from './OptimizeContext'

interface Props {
  target: OptimizeTarget
  size?: 'sm' | 'md'
  variant?: 'outline' | 'ghost'
  label?: string
  className?: string
}

export function OptimizeButton({ target, size = 'sm', variant = 'outline', label = 'AI 优化', className }: Props) {
  const { open, hasJobIntent } = useOptimize()
  return (
    <Button
      type="button"
      variant={variant}
      size={size === 'sm' ? 'sm' : 'default'}
      onClick={e => {
        e.preventDefault()
        e.stopPropagation()
        open(target)
      }}
      className={cn(
        'gap-1.5',
        hasJobIntent
          ? 'border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10'
          : 'opacity-70',
        className,
      )}
      title={hasJobIntent ? '基于目标岗位 + 工作年限改写' : '请先在基本信息里填写「求职意向」'}
    >
      <Sparkles className="h-3.5 w-3.5" />
      {label}
    </Button>
  )
}
