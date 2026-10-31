import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookmarkPlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { listSavedWorkingDirectories, removeSavedWorkingDirectory, saveWorkingDirectory } from '../api/savedWorkingDirectories'

const QUERY_KEY = ['vibe-saved-working-directories'] as const

export function SavedWorkingDirectories({ cwd, onSelect }: { cwd: string; onSelect: (path: string) => void }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: listSavedWorkingDirectories, staleTime: 0, retry: false })
  const lock = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null)
  const execute = async (action: () => Promise<void>) => {
    if (lock.current) return
    lock.current = true; setBusy(true); setFeedback(null)
    try { await action() }
    catch (error) {
      await client.invalidateQueries({ queryKey: ['claude-chat-workspaces'] })
      setFeedback({ error: true, message: error instanceof Error ? error.message : '操作失败，请重试。' })
    }
    finally {
      await Promise.all(['projects', 'project-catalog', 'config-block'].map(key => client.invalidateQueries({ queryKey: [key] })))
      lock.current = false; setBusy(false)
    }
  }
  const save = (path: string, message: string) => void execute(async () => {
    const directories = await saveWorkingDirectory(path)
    client.setQueryData(QUERY_KEY, directories)
    await client.invalidateQueries({ queryKey: ['claude-chat-workspaces'] }, { throwOnError: true })
    onSelect(path)
    setFeedback({ error: false, message })
  })
  return <section aria-label="常用工作目录" aria-busy={busy} className="mt-3 space-y-2 border-b pb-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 ref={heading} tabIndex={-1} className="text-xs font-medium">常用目录</h3>
      <Button type="button" variant="ghost" size="sm" disabled={!cwd.trim() || busy || query.isPending || query.isError}
        title={cwd || '先选择或输入工作目录'} onClick={() => save(cwd.trim(), '已保存并选中工作区，可在下方选择其中的项目。')}><BookmarkPlus className="size-4" />保存当前目录</Button>
    </div>
    <p className="text-xs text-[var(--color-muted-foreground)]">保存后加入下方工作区，换设备仍可使用。移除仅取消快捷入口；工作区可在项目库目录设置中管理，不删除文件。</p>
    {query.isPending && <p role="status" className="text-xs">正在读取常用目录…</p>}
    {query.isError && <p role="alert" className="text-xs">常用目录读取失败。<button type="button" className="underline" onClick={() => void query.refetch()}>重试常用目录</button></p>}
    {query.isSuccess && query.data.length === 0 && <p className="text-xs text-[var(--color-muted-foreground)]">暂无常用目录。先浏览或输入路径，再点击“保存当前目录”。</p>}
    <div className="max-h-52 space-y-1 overflow-y-auto overscroll-contain">
    {query.data?.map(path => <div key={path} className="flex min-w-0 items-stretch gap-1">
      <button type="button" disabled={busy} onClick={() => save(path, '已选用此工作区，可在下方选择其中的项目。')} className="min-h-11 min-w-0 flex-1 rounded-md border px-3 py-2 text-left text-xs break-all hover:bg-[var(--color-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-primary)] disabled:opacity-50">{path}</button>
      <Button type="button" variant="ghost" size="icon" className="min-h-11 shrink-0" disabled={busy} aria-label={`移除常用目录 ${path}`}
        onClick={() => void execute(async () => {
          client.setQueryData(QUERY_KEY, await removeSavedWorkingDirectory(path))
          heading.current?.focus()
          setFeedback({ error: false, message: '已移除快捷入口，磁盘文件保持不变。' })
        })}><X className="size-4" /></Button>
    </div>)}
    </div>
    {busy && <p role="status" className="text-xs">正在处理目录…</p>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'} className="break-words text-xs">{feedback.message}</p>}
  </section>
}
