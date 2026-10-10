import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { fetchCodexHomes } from '../api'
import { importCodexNativeThreads, listCodexNativeProjects, listCodexNativeThreads } from '../api/codexDesktopSync'
import type { CodexThreadPage } from '../api/codexDesktopSync'

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void; defaultHome?: string
  onOpenSession: (id: string) => void; onCreateProject: (cwd: string, home: string) => void
  returnFocus?: () => void
}
const message = (error: unknown) => error instanceof Error ? error.message : '查询未完成，请重试'
const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path

/** Read-only preview first; importing metadata never starts a model turn. */
export function CodexDesktopSyncDialog({ open, onOpenChange, defaultHome, onOpenSession, onCreateProject, returnFocus }: Props) {
  const portal = useFullscreenPortalContainer()
  const auth = useAuth()
  const qc = useQueryClient()
  const [chosenHome, setChosenHome] = useState(defaultHome ?? '')
  const [projectId, setProjectId] = useState('')
  const [cursors, setCursors] = useState<string[]>([''])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmedImports, setConfirmedImports] = useState<Map<string, string>>(new Map())
  const homes = useQuery({ queryKey: ['codex-sync-homes', auth.user?.userId], queryFn: fetchCodexHomes, enabled: open, retry: false })
  const home = chosenHome || homes.data?.[0] || ''
  const accountKey = ['codex-desktop-sync', auth.user?.userId ?? 'local', home]
  const projects = useInfiniteQuery({
    queryKey: [...accountKey, 'projects'], initialPageParam: '', enabled: open && Boolean(home), retry: false,
    queryFn: ({ pageParam, signal }) => listCodexNativeProjects(home, pageParam, signal),
    getNextPageParam: page => page.nextCursor ?? undefined,
  })
  const threads = useQuery({
    queryKey: [...accountKey, 'threads', projectId, cursors.at(-1)], enabled: open && Boolean(home), retry: false,
    queryFn: ({ signal }) => listCodexNativeThreads(home, cursors.at(-1), projectId, signal),
  })
  const importing = useMutation({
    mutationFn: () => importCodexNativeThreads(threads.data!.previewToken, selectedIds),
    onSuccess: result => {
      const imported = new Map(result.sessions.map(session => [session.threadId, session.sessionId]))
      setSelected(new Set())
      setConfirmedImports(previous => new Map([...previous, ...imported]))
      qc.setQueriesData<CodexThreadPage>({ queryKey: [...accountKey, 'threads'] }, page => page && ({
        ...page, data: page.data.map(row => imported.has(row.thread.id)
          ? { ...row, importedSessionId: imported.get(row.thread.id)! } : row),
      }))
      void qc.invalidateQueries({ queryKey: ['claude-chat-sessions'] })
      void qc.invalidateQueries({ queryKey: [...accountKey, 'threads'] })
    },
  })
  function resetSelection() { setCursors(['']); setSelected(new Set()); setConfirmedImports(new Map()); importing.reset() }
  function switchHome(value: string) { setChosenHome(value); setProjectId(''); resetSelection() }
  function switchProject(value: string) { setProjectId(value); resetSelection() }
  function movePage(next?: string) {
    setCursors(value => next ? [...value, next] : value.slice(0, -1))
    setSelected(new Set()); setConfirmedImports(new Map()); importing.reset()
  }
  const projectRows = projects.data?.pages.flatMap(page => page.data) ?? []
  const currentProject = projectRows.find(project => project.id === projectId)
  const rows = (threads.data?.data ?? []).map(row => confirmedImports.has(row.thread.id)
    ? { ...row, importedSessionId: confirmedImports.get(row.thread.id)! } : row)
  const selectable = rows.filter(row => !row.unavailableReason && !row.importedSessionId)
  const selectedIds = selectable.filter(row => selected.has(row.thread.id)).map(row => row.thread.id)
  const importedCount = rows.filter(row => row.importedSessionId).length
  const allImported = rows.length > 0 && importedCount === rows.length
  const pending = importing.isPending
  const openSession = (id: string) => { onOpenChange(false); onOpenSession(id) }

  return <Dialog.Root open={open} onOpenChange={value => { if (!pending) onOpenChange(value) }}>
    <Dialog.Portal container={portal}>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content onCloseAutoFocus={event => { if (returnFocus) { event.preventDefault(); returnFocus() } }}
        className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,840px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border bg-[var(--color-background)]">
        <div className="border-b px-5 py-4 pr-12">
          <Dialog.Title className="text-base font-semibold">同步 Codex 项目与会话</Dialog.Title>
          <Dialog.Description className="mt-1 text-sm text-[var(--color-muted-foreground)]">从本机授权目录选择历史，导入后在 Forge 继续原会话。</Dialog.Description>
          <Dialog.Close disabled={pending} aria-label="关闭 Codex 同步" className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-md hover:bg-[var(--color-muted)] disabled:opacity-40"><X className="size-4" /></Dialog.Close>
        </div>
        <div className="min-h-0 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1 text-xs text-[var(--color-muted-foreground)]">Codex 授权目录
              <select aria-label="Codex 授权目录" value={home} disabled={pending || homes.isPending}
                onChange={event => switchHome(event.target.value)} className="mt-2 h-11 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]">
                {!home && <option value="">{homes.isPending ? '正在读取授权目录…' : '未找到授权目录'}</option>}
                {[...new Set([home, ...(homes.data ?? [])])].filter(Boolean).map(path => <option key={path} value={path}>{path}</option>)}
              </select>
            </label>
            <Button variant="outline" disabled={pending || threads.isFetching || projects.isFetching || homes.isFetching}
              onClick={() => { setSelected(new Set()); importing.reset(); void homes.refetch(); void projects.refetch(); void threads.refetch() }}>
              <RefreshCw className="size-4" />刷新
            </Button>
          </div>
          {homes.isError && <p role="alert" className="mt-3 text-sm text-red-600">{message(homes.error)}。请使用刷新重试。</p>}
          <label className="mt-4 block text-xs text-[var(--color-muted-foreground)]">原生项目
            <select aria-label="原生项目" value={projectId} disabled={pending || projects.isPending} onChange={event => switchProject(event.target.value)}
              className="mt-2 h-11 w-full rounded-md border bg-[var(--color-background)] px-3 text-sm text-[var(--color-foreground)]">
              <option value="">全部会话（按工作目录归组）</option>
              {projectRows.map(project => <option key={project.id} value={project.id}>{project.name} · {project.roots.map(folderName).join(' / ') || '无根目录'}</option>)}
            </select>
          </label>
          {projects.hasNextPage && <Button variant="ghost" size="sm" disabled={pending || projects.isFetchingNextPage} onClick={() => void projects.fetchNextPage()}>加载更多项目</Button>}
          {projects.isError && <p role="alert" className="mt-2 text-xs text-red-600">项目列表未读取：{message(projects.error)}。仍可浏览全部会话，或刷新重试。</p>}
          {currentProject && <div className="mt-2 text-xs text-[var(--color-muted-foreground)]">
            {currentProject.roots.map(root => <p key={root} className="break-all">{root}</p>)}
            <p className="mt-1">{threads.data?.projectMatch === 'directory'
              ? '按项目根目录精确匹配旧会话；这些记录尚未分配原生项目 ID。'
              : '优先展示原生项目会话，随后按根目录匹配未分配项目的旧会话。'}</p>
          </div>}
          <p className="mt-4 text-xs leading-relaxed text-[var(--color-muted-foreground)]">此目录可能同时包含桌面、CLI 和 VS Code 会话。这里只同步未归档的持久会话；导入不会启动模型。继续对话前，请先停止桌面对同一会话的生成。</p>
          <div className="mt-4 flex items-center justify-between border-b pb-2 text-xs text-[var(--color-muted-foreground)]">
            <span>本页 {rows.length} 个会话 · 已导入 {importedCount} 个</span>
            <button type="button" className="min-h-9 rounded px-2 hover:bg-[var(--color-muted)] disabled:opacity-40" disabled={pending || threads.isFetching || !selectable.length}
              onClick={() => setSelected(selectedIds.length === selectable.length ? new Set() : new Set(selectable.map(row => row.thread.id)))}>{selectedIds.length === selectable.length && selectable.length ? '取消全选' : '选择本页'}</button>
          </div>
          {threads.isError && <div role="alert" className="py-6 text-sm"><p>{message(threads.error)}</p><Button variant="outline" className="mt-3" onClick={() => void threads.refetch()}>重试读取</Button></div>}
          {threads.isFetching && !threads.data ? <p role="status" className="flex items-center gap-2 py-8 text-sm text-[var(--color-muted-foreground)]"><Loader2 className="size-4 animate-spin" />正在读取 Codex 会话…</p>
              : rows.length === 0 ? !threads.isError && <div className="py-6 text-sm text-[var(--color-muted-foreground)]"><p>{home ? '该范围暂无未归档会话。' : '请选择已登录的 Codex 授权目录。'}</p>
                {currentProject?.roots[0] && <Button variant="outline" className="mt-3" onClick={() => { onOpenChange(false); onCreateProject(currentProject.roots[0], home) }}>在此项目新建会话</Button>}
              </div> : <ul className="divide-y" aria-label="Codex 原生会话">
                {rows.map(({ thread, importedSessionId, unavailableReason }) => <li key={thread.id} className="flex gap-3 py-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input type="checkbox" aria-label={`选择 ${thread.title}`} checked={!importedSessionId && selected.has(thread.id)} disabled={pending || threads.isFetching || Boolean(importedSessionId) || Boolean(unavailableReason)} className="mt-1 size-4 shrink-0 accent-[var(--color-primary)]"
                    onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(thread.id); else next.delete(thread.id); return next })} />
                  <div className="min-w-0 flex-1"><p className="break-words text-sm font-medium">{thread.title}</p>
                    <p className="mt-1 break-all text-xs text-[var(--color-muted-foreground)]">{thread.cwd}</p>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">{new Date(thread.updatedAt).toLocaleString()} · {thread.model ?? '默认模型'} · {thread.source}</p>
                    {unavailableReason && <p className="mt-1 text-xs text-amber-700">{unavailableReason}</p>}
                  </div>
                  </label>
                  {importedSessionId && <Button variant="ghost" size="sm" disabled={pending || Boolean(unavailableReason)} onClick={() => openSession(importedSessionId)}><CheckCircle2 aria-hidden="true" className="size-4 text-[var(--color-success)]" />已导入 · 打开</Button>}
                </li>)}
              </ul>}
          {(cursors.length > 1 || threads.data?.nextCursor) && <div className="mt-3 flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={pending || threads.isFetching || cursors.length < 2} onClick={() => movePage()}><ArrowLeft className="size-4" />上一页</Button>
            <span className="text-xs text-[var(--color-muted-foreground)]">第 {cursors.length} 页</span>
            <Button variant="ghost" size="sm" disabled={pending || threads.isFetching || !threads.data?.nextCursor} onClick={() => movePage(threads.data?.nextCursor ?? undefined)}>下一页<ArrowRight className="size-4" /></Button>
          </div>}
        </div>
        <div className="border-t px-5 py-4">
          {importing.isError && <p role="alert" className="mb-3 text-sm text-red-600">{message(importing.error)}。如请求超时，请刷新核对已导入状态后重试。</p>}
          {importing.data && <div role="status" className="mb-3 text-sm"><p className="mb-1 flex items-center gap-2 font-medium text-[var(--color-success)]"><CheckCircle2 aria-hidden="true" className="size-4" />导入成功</p><p>新增 {importing.data.added} 个，复用 {importing.data.reused} 个已有会话。</p>
            {importing.data.sessions.length === 1 && <Button variant="ghost" size="sm" onClick={() => openSession(importing.data.sessions[0].sessionId)}>打开导入的会话</Button>}
          </div>}
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-[var(--color-muted-foreground)]">{allImported ? '已导入记录可直接打开，无需重复导入' : `已选 ${selectedIds.length} 个 · 保留原生上下文，已有设置不覆盖`}</span>
            <Button className="min-h-11" disabled={pending || threads.isFetching || threads.isError || !threads.data || !selectedIds.length} onClick={() => importing.mutate()}>{pending && <Loader2 className="size-4 animate-spin" />}{pending ? '正在导入…' : allImported ? '本页已全部导入' : '导入所选会话'}</Button>
          </div>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}
