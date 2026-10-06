import { useEffect, useState, type RefObject } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'

export interface TurnChangeRecord {
  turnId: string; startedAt: number; endedAt: number | null; stopReason: string | null; state: 'RUNNING' | 'COMPLETE' | 'PARTIAL'
  warnings: string[]
  repositories: { label: string; beforeHead: string | null; afterHead: string | null
    files: { path: string; originalPath: string | null; status: string; source: string }[] }[]
}
export async function fetchTurnChanges(sessionId: string, q: string, turnId: string, offset: number): Promise<TurnChangeRecord[]> {
  const params = new URLSearchParams({ q, turnId, offset: String(offset) })
  const response = await fetch(`/api/claude-chat/sessions/${encodeURIComponent(sessionId)}/changes?${params}`)
  if (!response.ok) throw new Error(response.status === 404 ? '当前服务尚未提供变更记录，请加载新版后端后重试。' : '变更记录获取失败，请重试。')
  return response.json()
}
const statuses: Record<string, string> = { M: '修改', A: '新增', D: '删除', R: '重命名', C: '复制', '?': '新增', U: '冲突' }
const control = 'min-h-11 rounded-md px-3 text-sm focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-40'

export function TurnChangesDialog({ sessionId, turnId = '', open, onOpenChange, returnFocus }: {
  sessionId: string; turnId?: string; open: boolean; onOpenChange: (open: boolean) => void; returnFocus?: RefObject<HTMLElement | null>
}) {
  const portal = useFullscreenPortalContainer()
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  useEffect(() => { setSearch(''); setQuery(''); setPage(0) }, [sessionId, turnId])
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(0) }, 250); return () => clearTimeout(timer) }, [search])
  const result = useQuery({ queryKey: ['turn-changes', sessionId, turnId, query, page],
    queryFn: () => fetchTurnChanges(sessionId, query, turnId, page * 20), enabled: open && !!sessionId, retry: false,
    refetchInterval: open ? 10000 : false })
  const records = result.data?.slice(0, 20) ?? []
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/35" />
    <Dialog.Content onCloseAutoFocus={event => { if (returnFocus?.current) { event.preventDefault(); returnFocus.current.focus() } }} className="fixed left-1/2 top-1/2 z-[81] flex max-h-[90dvh] w-[min(94vw,800px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-[var(--color-border)] bg-[var(--color-background)]">
      <header className="flex items-start gap-3 border-b p-4">
        <div className="flex-1"><Dialog.Title className="text-base font-semibold">{turnId ? '本轮变更' : '会话变更记录'}</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">Git 基线与结束快照记录轮次期间的变化。共享目录可能包含其他会话或手动修改，不代表本会话独占贡献。</Dialog.Description></div>
        <Dialog.Close aria-label="关闭变更记录" className={control}><X className="size-4" /></Dialog.Close>
      </header>
      <div className="border-b px-4 py-3"><input aria-label="搜索变更文件或轮次" placeholder="搜索文件路径、仓库或轮次" maxLength={200} value={search} onChange={event => setSearch(event.target.value)}
        className="min-h-11 w-full rounded-md border bg-transparent px-3 text-sm" /></div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4">
        {result.isPending && <p role="status" className="py-6 text-sm">正在读取变更记录…</p>}
        {result.isError && <div role="alert" className="py-6 text-sm"><p>{result.error.message}</p><button className={control} onClick={() => void result.refetch()}>重试</button></div>}
        {!result.isPending && !result.isError && records.length === 0 && <p role="status" className="py-6 text-sm text-[var(--color-muted-foreground)]">{query ? '没有匹配的变更记录，可清空搜索。' : '暂无记录。启用此能力后的新轮次才会采集；旧轮次不会根据当前 Git 状态补造。'}</p>}
        {records.map(record => <section key={record.turnId} className="border-b py-4 last:border-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span>{new Date(record.startedAt).toLocaleString()} · 轮次 {record.turnId.slice(0, 8)}</span>
            <span className="text-[var(--color-muted-foreground)]">{record.state === 'RUNNING' ? '尚未收口' : record.state === 'PARTIAL' ? '部分采集' : '已采集'}{record.stopReason ? ` · ${record.stopReason}` : ''}</span></div>
          {record.repositories.map((repo, index) => <div key={index} className="mt-3">
            <h3 className="text-sm font-medium">{repo.label} <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{repo.beforeHead?.slice(0, 8) ?? '无 HEAD'} → {repo.afterHead?.slice(0, 8) ?? '未收口'}</span></h3>
            <ul className="mt-2 divide-y">{repo.files.map(file => <li key={file.path} className="flex items-start gap-3 py-2 text-xs">
              <span className="w-14 shrink-0 text-[var(--color-muted-foreground)]">{statuses[file.status] ?? file.status}</span>
              <div className="min-w-0 flex-1 break-all font-mono">{file.originalPath && <span className="text-[var(--color-muted-foreground)]">{file.originalPath} → </span>}{file.path}
                {file.source === 'COMMIT_PREEXISTING' && <p className="mt-1 font-sans text-[var(--color-muted-foreground)]">开始时已有修改，期间提交；不能归为本轮新增内容</p>}</div>
              <span className="shrink-0 text-[var(--color-muted-foreground)]">{file.source.startsWith('COMMIT') ? '提交区间' : '工作区'}</span>
            </li>)}</ul>
            {repo.files.length === 0 && record.state !== 'RUNNING' && <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">未观察到文件变化{record.state === 'PARTIAL' ? '，采集存在缺口' : ''}。</p>}
          </div>)}
          {record.warnings.length > 0 && <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">采集说明：{record.warnings.join('；')}</p>}
        </section>)}
      </div>
      <footer className="flex items-center justify-between border-t px-4 py-2 text-xs"><span>第 {page + 1} 页 · 只读记录</span><div><button className={control} disabled={page === 0} onClick={() => setPage(value => value - 1)}>上一页</button>
        <button className={control} disabled={(result.data?.length ?? 0) <= 20 || result.isFetching} onClick={() => setPage(value => value + 1)}>下一页</button></div></footer>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}
