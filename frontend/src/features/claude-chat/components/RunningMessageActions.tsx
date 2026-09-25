import { ListPlus, CornerUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function canSteerRunningMessage(engine: string | null | undefined, providerBaseUrl: string | null | undefined, attachmentCount: number): boolean {
  return engine === 'codex' && providerBaseUrl == null && attachmentCount === 0
}

interface Props {
  canSteer: boolean
  disabled: boolean
  onSteer: () => void
  onEnqueue: () => void
  className?: string
}

export function RunningMessageActions({ canSteer, disabled, onSteer, onEnqueue, className }: Props) {
  return (
    <div className={cn('flex min-w-0 items-center justify-end gap-2', className)}>
      {canSteer && (
        <Button type="button" variant="outline" size="sm" className="min-h-10 min-w-0 flex-1 px-2 sm:flex-none sm:px-3"
          disabled={disabled} onClick={onSteer} title="补充到正在进行的 Codex 当前轮">
          <CornerUpRight aria-hidden="true" />补充到当前轮
        </Button>
      )}
      <Button type="button" variant="secondary" size="sm" className="min-h-10 min-w-0 flex-1 px-2 sm:flex-none sm:px-3"
        disabled={disabled} onClick={onEnqueue} title="本轮结束后按顺序发送">
        <ListPlus aria-hidden="true" />加入队列
      </Button>
    </div>
  )
}
