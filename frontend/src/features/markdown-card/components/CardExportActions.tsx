import { Copy, Loader2, Share2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ExportButton } from './ExportButton'

interface Props {
  onExport: (progress: (message: string | null) => void) => Promise<void>
  onPrepare: () => void
  onShare: () => void
  onCopy: () => void
  disabled: boolean
  busy: boolean
  ready: boolean
  shareAvailable: boolean
  progress: string | null
  feedback: string | null
}

export function CardExportActions({ onExport, onPrepare, onShare, onCopy, disabled, busy, ready, shareAvailable, progress, feedback }: Props) {
  return <div className="flex max-w-full flex-col items-end gap-1.5">
    <div className="flex flex-wrap justify-end gap-2">
      <Button variant="outline" className="min-h-11" onClick={onCopy} disabled={disabled || busy}>
        <Copy className="size-4" />复制图片
      </Button>
      <ExportButton onExport={onExport} disabled={disabled || busy} label="保存 PNG" variant="outline" />
      <Button className="min-h-11" onClick={ready ? onShare : onPrepare} disabled={disabled || busy || (ready && !shareAvailable)}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Share2 className="size-4" />}
        {busy ? progress ?? '处理中…' : ready ? '选择应用分享' : '分享'}
      </Button>
    </div>
    {(ready || feedback) && <p role="status" className="max-w-sm text-xs text-[var(--color-muted-foreground)]">
      {feedback ?? '图片已就绪，无需先保存。点击选择 QQ、微信或飞书；可用应用以系统面板为准。'}
    </p>}
  </div>
}
