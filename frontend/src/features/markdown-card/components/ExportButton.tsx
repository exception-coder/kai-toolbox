import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

type ExportFn = (
  setProgress: (msg: string | null) => void,
) => Promise<void>

interface ExportButtonProps {
  onExport: ExportFn
  disabled?: boolean
  label?: string
}

export function ExportButton({ onExport, disabled, label = '导出 PNG' }: ExportButtonProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)

  async function handleClick() {
    if (busy) return
    setBusy(true)
    setError(null)
    setProgress(null)
    try {
      await onExport(setProgress)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={disabled || busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        {busy ? progress ?? '导出中…' : label}
      </Button>
      {error && (
        <span className="text-xs text-[var(--color-destructive)]">{error}</span>
      )}
    </div>
  )
}
