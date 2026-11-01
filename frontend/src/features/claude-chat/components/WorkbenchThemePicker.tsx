import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Check, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { useAuth } from '@/lib/auth'
import { setWorkbenchTheme, useWorkbenchTheme, WORKBENCH_THEMES, workbenchThemeStyle, type WorkbenchTheme } from '../lib/workbenchTheme'
import '../styles/workbench-theme.css'

export function WorkbenchThemePicker() {
  const selected = useWorkbenchTheme()
  const { user } = useAuth()
  const [error, setError] = useState(false)
  const choose = (theme: WorkbenchTheme) => {
    try { setWorkbenchTheme(theme, user?.userId); setError(false) } catch { setError(true) }
  }
  return <>
    <div className="mt-3 grid grid-cols-2 gap-3" role="group" aria-label="工作台主题">
      {WORKBENCH_THEMES.map(theme => <button key={theme.id} type="button" aria-pressed={selected === theme.id}
        aria-label={theme.name} onClick={() => choose(theme.id)}
        className="wb-theme-option min-w-0 rounded-lg border border-[var(--color-border)] p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <span aria-hidden="true" className="wb-theme-preview" style={workbenchThemeStyle(theme.id)}>
          <span className="wb-theme-preview-chrome"><i /><b /></span>
          <span className="wb-theme-preview-body"><i /><i /><i /></span>
          <span className="wb-theme-preview-input" />
        </span>
        <span className="mt-2 flex min-w-0 items-center justify-between gap-1 text-sm font-medium">
          <span>{theme.name}</span>{selected === theme.id && <Check className="size-4 shrink-0 text-[var(--color-primary)]" />}
        </span>
        <span className="mt-1 block text-xs text-[var(--color-muted-foreground)]">{theme.description}</span>
      </button>)}
      <button type="button" aria-pressed={selected === 'inherit'} onClick={() => choose('inherit')}
        className="wb-theme-option min-h-11 rounded-lg border border-[var(--color-border)] p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
        <span className="flex items-center justify-between gap-1 text-sm font-medium">跟随全局外观{selected === 'inherit' && <Check className="size-4 shrink-0 text-[var(--color-primary)]" />}</span>
        <span className="mt-1 block text-xs leading-relaxed text-[var(--color-muted-foreground)]">使用平台原有浅色、深色及材质设置</span>
      </button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs text-[var(--color-warning)]">浏览器未允许保存，主题未更改。请允许本地存储后重试。</p>}
  </>
}

export function WorkbenchThemeDialog({ open, onOpenChange, returnFocus }: { open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: () => void }) {
  const theme = useWorkbenchTheme()
  const portal = useFullscreenPortalContainer()
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/40" />
    <Dialog.Content data-workbench-theme={theme === 'inherit' ? undefined : theme} style={workbenchThemeStyle(theme)}
      onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
      className="fixed left-1/2 top-1/2 z-[60] max-h-[90dvh] w-[min(92vw,480px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-5 text-[var(--color-foreground)]">
      <div className="flex items-center justify-between gap-2"><Dialog.Title className="text-base font-semibold">工作台主题</Dialog.Title>
        <Dialog.Close aria-label="关闭主题设置" className="flex size-11 items-center justify-center rounded-md hover:bg-[var(--color-muted)]"><X className="size-4" /></Dialog.Close></div>
      <Dialog.Description className="text-xs leading-relaxed text-[var(--color-muted-foreground)]">仅改变外观，保留布局、草稿和任务状态。按当前账号保存在此浏览器。</Dialog.Description>
      <WorkbenchThemePicker />
      <div className="mt-4 flex justify-end"><Dialog.Close className="min-h-11 rounded-md border border-[var(--color-border)] px-4 text-sm">完成</Dialog.Close></div>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
