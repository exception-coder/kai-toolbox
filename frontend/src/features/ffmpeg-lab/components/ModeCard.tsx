import { useState } from 'react'
import { ChevronDown, Loader2, Play, Terminal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ModeView, Prediction } from '../types'

interface Props {
  mode: ModeView
  /** 该模式当前是否在跑。 */
  running: boolean
  /** 是否为当前正在播放的模式。 */
  active: boolean
  /** 任意模式在跑时禁用其它运行按钮。 */
  disabled: boolean
  onRun: (mode: ModeView) => void
}

const PREDICTION_META: Record<Prediction, { label: string; variant: 'success' | 'secondary' | 'destructive' }> = {
  OK: { label: '可直出', variant: 'success' },
  TRANSCODE: { label: '需转码', variant: 'secondary' },
  FAIL: { label: '预判不可行', variant: 'destructive' },
}

/** 单个转码模式卡：展示预判、理由、可折叠的 ffmpeg 命令，以及醒目的运行按钮。 */
export function ModeCard({ mode, running, active, disabled, onRun }: Props) {
  const [showCmd, setShowCmd] = useState(false)
  const meta = PREDICTION_META[mode.prediction]

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-[var(--color-card)] p-4 transition-colors',
        active ? 'border-[var(--color-primary)] ring-2 ring-[var(--color-primary)]/30' : 'border-[var(--color-border)]',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{mode.label}</div>
          <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">{mode.predictionReason}</div>
        </div>
        <Badge variant={meta.variant} className="shrink-0">{meta.label}</Badge>
      </div>

      <button
        type="button"
        onClick={() => setShowCmd(v => !v)}
        className="flex items-center gap-1 text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <Terminal className="h-3.5 w-3.5" />
        命令
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', showCmd && 'rotate-180')} />
      </button>
      {showCmd && (
        <pre className="max-h-32 overflow-auto rounded-md bg-[var(--color-muted)] p-2 text-[11px] leading-relaxed text-[var(--color-foreground)] whitespace-pre-wrap break-all">
          {mode.command}
        </pre>
      )}

      <Button
        size="lg"
        variant={active ? 'default' : 'outline'}
        disabled={disabled && !running}
        onClick={() => onRun(mode)}
        className="w-full shadow-sm"
      >
        {running ? <Loader2 className="animate-spin" /> : <Play />}
        {running ? '运行中…' : active ? '重新运行' : '运行此模式'}
      </Button>
    </div>
  )
}
