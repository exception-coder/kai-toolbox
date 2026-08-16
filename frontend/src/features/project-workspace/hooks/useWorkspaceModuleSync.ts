import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { applyModuleSync, previewModuleSync } from '@/features/claude-chat/public-api'

/** 持有模块扫描预览、选择和追加写入流程。 */
export function useWorkspaceModuleSync(selectedPath: string, onApplied: () => void) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [message, setMessage] = useState<string | null>(null)

  const preview = useMutation({ mutationFn: () => previewModuleSync(selectedPath) })
  const apply = useMutation({
    mutationFn: (picks: { key: string; codePath: string }[]) => applyModuleSync(selectedPath, picks),
    onSuccess: result => {
      setMessage(`已追加 ${result.appended} 个模块${result.skipped ? `（跳过 ${result.skipped}）` : ''}`)
      setOpen(false)
      onApplied()
    },
  })

  const start = () => {
    setMessage(null)
    setSelected(new Set())
    setOpen(true)
    preview.reset()
    apply.reset()
    preview.mutate()
  }

  const toggle = (codePath: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(codePath)) next.delete(codePath)
    else next.add(codePath)
    return next
  })

  const toggleAll = (codePaths: string[]) => {
    setSelected(current => current.size >= codePaths.length ? new Set() : new Set(codePaths))
  }

  const close = () => setOpen(false)

  return { open, setOpen, selected, message, setMessage, preview, apply, start, close, toggle, toggleAll }
}
