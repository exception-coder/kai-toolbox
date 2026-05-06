import { Send } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  peerCount: number
  onPick: () => void
}

export function BroadcastButton({ peerCount, onPick }: Props) {
  const disabled = peerCount === 0
  return (
    <div className="relative inline-flex items-center justify-center">
      {!disabled && <span className="lanshare-broadcast-pulse" />}
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className={cn(
          'relative z-10 inline-flex flex-col items-center justify-center gap-1',
          'h-16 w-16 rounded-full shadow-lg',
          'bg-[var(--color-primary)] text-[var(--color-primary-foreground)]',
          'transition-all active:scale-95',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        )}
        aria-label={disabled ? '等待其他设备加入' : '群发文件给所有设备'}
      >
        <Send className="h-5 w-5" />
        <span className="text-[10px] leading-none">{disabled ? '等待加入' : '群发'}</span>
      </button>
    </div>
  )
}
