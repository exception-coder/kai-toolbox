// 导出操作：PNG 与 PDF 双按钮 + 进度 / 错误展示
import { useState } from 'react'
import { Download, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ExportFormat } from '../types'

interface Props {
  onExport: (fmt: ExportFormat) => Promise<void>
  disabled?: boolean
}

export function ExportPanel({ onExport, disabled }: Props) {
  const [busy, setBusy] = useState<ExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handle(fmt: ExportFormat) {
    if (busy) return
    setBusy(fmt)
    setError(null)
    try {
      await onExport(fmt)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex w-full flex-col items-end gap-1.5">
      <div className="flex w-full items-stretch gap-2 rounded-lg border-2 border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-1 shadow-sm">
        <Button
          variant="ghost"
          onClick={() => handle('png')}
          disabled={disabled || !!busy}
          className="h-10 min-w-0 flex-1 px-2 font-semibold sm:px-4"
        >
          {busy === 'png' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          导出 PNG
        </Button>
        <Button
          onClick={() => handle('pdf')}
          disabled={disabled || !!busy}
          size="lg"
          className="h-10 min-w-0 flex-1 px-2 text-sm font-semibold shadow-md sm:px-5"
        >
          {busy === 'pdf' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          导出 PDF
        </Button>
      </div>
      {error && <span className="text-xs text-[var(--color-destructive)]">{error}</span>}
    </div>
  )
}
