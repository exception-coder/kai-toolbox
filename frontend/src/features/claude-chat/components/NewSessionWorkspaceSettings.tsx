import { useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { registerWorkspaceRoot } from '@/features/project-workspace/public-api'
import { browseWorkingDirectory } from '../api/workingDirectories'
import { WorkingDirectoryPicker } from './WorkingDirectoryPicker'
import { SavedWorkingDirectories } from './SavedWorkingDirectories'

export function NewSessionWorkspaceSettings({ mode, cwd, onClose, onSelect, onAggregate, children }: {
  mode: 'create' | 'settings'; cwd: string; onClose: () => void
  onSelect: (path: string) => void; onAggregate: () => void; children: ReactNode
}) {
  const [path, setPath] = useState(mode === 'create' ? '' : cwd)
  const [browsing, setBrowsing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const browseTrigger = useRef<HTMLButtonElement>(null)
  const client = useQueryClient()
  const save = async () => {
    if (lock.current || !path.trim()) return
    lock.current = true; setBusy(true); setError(null)
    let registered = false
    try {
      const directory = await browseWorkingDirectory(path.trim())
      await registerWorkspaceRoot(directory.path)
      registered = true
      await Promise.all(['claude-chat-workspaces', 'project-catalog', 'projects', 'config-block'].map(key =>
        client.invalidateQueries({ queryKey: [key] }, { throwOnError: true })))
      onSelect(directory.path)
      onClose()
    } catch (caught) {
      setError(`${registered ? '工作区已登记，列表刷新失败；可重试刷新：' : ''}${caught instanceof Error ? caught.message : '保存失败，请重试。'}`)
    } finally { lock.current = false; setBusy(false) }
  }
  return <Sheet open onOpenChange={open => { if (!open && !lock.current) onClose() }}>
    <SheetContent side="right" hideCloseButton className="flex h-full w-full max-w-full flex-col p-0 sm:max-w-lg"
      onEscapeKeyDown={event => { if (lock.current) event.preventDefault() }} onPointerDownOutside={event => { if (lock.current) event.preventDefault() }}>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
        <div><SheetTitle>{mode === 'create' ? '新建工作区' : '工作区与运行设置'}</SheetTitle>
          <SheetDescription className="mt-1 text-xs">{mode === 'create' ? '选择此 Forge 电脑上的文件夹，登记后可重复使用。' : '按需调整目录和运行配置，关闭后返回新建会话。'}</SheetDescription></div>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>返回</Button>
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        <section className="space-y-2" aria-busy={busy}>
          <label htmlFor="new-session-workspace-path" className="block text-sm font-medium">工作区目录</label>
          <div className="flex gap-2">
            <input id="new-session-workspace-path" value={path} disabled={busy} onChange={event => setPath(event.target.value)}
              placeholder="例如 D:/projects" className="h-10 min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-3 text-sm" />
            <Button ref={browseTrigger} variant="outline" disabled={busy} aria-expanded={browsing} onClick={() => setBrowsing(value => !value)}><FolderOpen className="size-4" />浏览</Button>
          </div>
          {browsing && <WorkingDirectoryPicker initialPath={path} onSelect={value => { setPath(value); setBrowsing(false); browseTrigger.current?.focus() }}
            onCancel={() => { setBrowsing(false); browseTrigger.current?.focus() }} />}
          {error && <p role="alert" className="break-words text-xs text-[var(--color-destructive)]">{error}</p>}
          <Button disabled={busy || !path.trim()} onClick={() => void save()}>{busy ? '正在保存…' : '保存并使用工作区'}</Button>
        </section>
        {mode === 'settings' && <fieldset disabled={busy} className="min-w-0 space-y-5">
          <SavedWorkingDirectories cwd={cwd} onSelect={value => { if (!lock.current) { onSelect(value); onClose() } }} />
          <Button variant="outline" onClick={() => { if (!lock.current) onAggregate() }}>合并多个目录为工作区</Button>
          <section className="space-y-3 border-t pt-4" aria-label="运行设置">{children}</section>
        </fieldset>}
      </div>
    </SheetContent>
  </Sheet>
}
