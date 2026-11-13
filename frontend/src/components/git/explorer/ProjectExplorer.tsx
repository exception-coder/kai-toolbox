import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Virtuoso } from 'react-virtuoso'
import { ArrowLeft, ChevronRight, Copy, FileCode2, Folder, FolderTree, GitBranch, GitCommitHorizontal, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { ReviewCode } from './ReviewCode'
import { BranchList } from './BranchList'
import type { CommitInfo, GitBranchRef } from '../types'
import { reviewRequest, statusNames, type ExplorerProps, type ReviewChange, type ReviewChanges, type ReviewContent, type ReviewHistory, type ReviewTree } from './api'
import './explorer.css'

type Mode = 'tree' | 'history' | 'workspace' | 'operations'
type Selection = { path: string; ref: string; diff: boolean }
const modes = [{ id: 'tree', label: '项目目录', icon: FolderTree }, { id: 'history', label: '提交历史', icon: GitCommitHorizontal }, { id: 'workspace', label: '工作区变更', icon: FileCode2 }] as const
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

export default function ProjectExplorer({ title, endpoint, onClose, restoreFocus, fetchRepos, renderGitActions }: ExplorerProps) {
  const portal = useFullscreenPortalContainer()
  const returnTo = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const heading = useRef<HTMLHeadingElement>(null)
  const layout = useRef<HTMLDivElement>(null)
  const client = useQueryClient()
  const [mode, setMode] = useState<Mode>('history')
  const [branchRef, setBranchRef] = useState('')
  const [operationBusy, setOperationBusy] = useState(false)
  const [repo, setRepo] = useState('')
  const [folder, setFolder] = useState('')
  const [treeRef, setTreeRef] = useState('HEAD')
  const [offset, setOffset] = useState(0)
  const [commit, setCommit] = useState('')
  const [layer, setLayer] = useState('combined')
  const [selected, setSelected] = useState<Selection | null>(null)
  const [codeMode, setCodeMode] = useState<'unified' | 'split'>('unified')
  const [stage, setStage] = useState<'navigation' | 'files' | 'code'>('navigation')
  const [search, setSearch] = useState('')
  const [feedback, setFeedback] = useState('')
  const [widths, setWidths] = useState([240, 260])
  const prefix = ['project-explorer', endpoint, repo]
  const repositories = useQuery({ queryKey: ['project-explorer-repositories', endpoint], queryFn: fetchRepos ?? (async () => []), enabled: !!fetchRepos, retry: false })
  const ready = !fetchRepos || !!repositories.data?.some(item => item.name === repo)
  const info = useQuery({ queryKey: [...prefix, 'info'], queryFn: ({ signal }) => reviewRequest<{ branch: string; head: string }>(endpoint, repo, 'info', {}, signal), enabled: ready, retry: false })
  useEffect(() => { if (repositories.data?.length && !repositories.data.some(item => item.name === repo)) setRepo(repositories.data[0].name) }, [repositories.data, repo])
  const tree = useQuery({ queryKey: [...prefix, 'tree', treeRef, folder, offset],
    queryFn: ({ signal }) => reviewRequest<ReviewTree>(endpoint, repo, 'tree', { ref: treeRef, path: folder, offset }, signal), enabled: ready && mode === 'tree', retry: false, staleTime: treeRef === 'HEAD' ? 0 : Infinity, refetchOnWindowFocus: false })
  const branches = useQuery({ queryKey: [...prefix, 'branches'], queryFn: ({ signal }) => reviewRequest<GitBranchRef[]>(endpoint, repo, 'branches', {}, signal), enabled: ready && mode === 'history', retry: false, refetchOnWindowFocus: false })
  const selectedBranch = branches.data?.find(item => item.ref === branchRef)
  const historyHead = branchRef ? selectedBranch?.head : 'HEAD'
  const history = useInfiniteQuery({ queryKey: [...prefix, 'history', branchRef, historyHead], initialPageParam: { ref: historyHead || 'HEAD', offset: 0 },
    queryFn: ({ pageParam, signal }) => reviewRequest<ReviewHistory>(endpoint, repo, 'history', pageParam, signal),
    getNextPageParam: (last, pages) => last.hasMore ? { ref: last.ref, offset: pages.reduce((n, p) => n + p.commits.length, 0) } : undefined,
    enabled: ready && mode === 'history' && (!branchRef || !!historyHead), retry: false, refetchOnWindowFocus: false })
  const commitDetail = useQuery({ queryKey: [...prefix, 'commit-info', commit], queryFn: ({ signal }) => reviewRequest<CommitInfo>(endpoint, repo, 'commit', { ref: commit }, signal), enabled: ready && mode === 'history' && !!commit, retry: false })
  const changes = useQuery({ queryKey: [...prefix, mode, commit, layer],
    queryFn: ({ signal }) => reviewRequest<ReviewChanges>(endpoint, repo, mode === 'workspace' ? 'workspace' : 'changes', mode === 'workspace' ? { layer } : { commit }, signal),
    enabled: ready && (mode === 'workspace' || mode === 'history' && !!commit), retry: false, refetchOnWindowFocus: false })
  const content = useQuery({ queryKey: [...prefix, 'content', selected, layer],
    queryFn: ({ signal }) => reviewRequest<ReviewContent>(endpoint, repo, selected!.diff ? 'difference' : 'source',
      selected!.diff ? { commit: selected!.ref, path: selected!.path, layer } : { ref: selected!.ref, path: selected!.path }, signal), enabled: !!selected, retry: false })
  const commits = history.data?.pages.flatMap(page => page.commits) ?? []
  const files = useMemo(() => (changes.data?.files ?? []).slice().sort((a, b) => a.path.localeCompare(b.path)), [changes.data])
  const shownFiles = mode === 'workspace' ? files.filter(file => file.path.toLowerCase().includes(search.toLowerCase())) : files
  const shownCommits = commits.filter(item => `${item.subject} ${item.author} ${item.hash}`.toLowerCase().includes(search.toLowerCase()))
  const counts = Object.entries(statusNames).map(([code, label]) => [code, label, files.filter(file => file.status === code).length] as const).filter(([, , count]) => count)
  useEffect(() => { setFeedback('') }, [selected, repo, layer])
  useEffect(() => {
    if (treeRef === 'HEAD' && tree.data?.ref && !tree.isFetching) {
      client.setQueryData([...prefix, 'tree', tree.data.ref, folder, offset], tree.data)
      setTreeRef(tree.data.ref)
    }
  }, [treeRef, tree.data, tree.isFetching, client, endpoint, repo, folder, offset])
  const clearSelection = () => { setSelected(null); setCommit(''); setFolder(''); setOffset(0); setTreeRef('HEAD'); setBranchRef(''); setStage('navigation'); setSearch('') }
  const chooseBranch = (value: string) => { setBranchRef(value); setCommit(''); setSelected(null); setSearch(''); setStage('navigation') }
  const chooseMode = (value: Mode) => { setMode(value); setSelected(null); setStage('navigation'); setSearch('') }
  const openFolder = (path: string, ref: string) => { setFolder(path); setTreeRef(ref || 'HEAD'); setOffset(0); setSelected(null); setStage('files') }
  const openFile = (path: string, ref: string, diff: boolean) => { setSelected({ path, ref, diff }); setStage('code') }
  const currentFiles = mode !== 'history' || !!commit
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); setFeedback('代码已复制') } catch { setFeedback('未能复制，请允许剪贴板访问后重试。') }
  }
  function separator(index: number) {
    const branchWidth = mode === 'history' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1280px)').matches ? 190 : 0
    const change = (value: number) => setWidths(previous => previous.map((width, i) => i === index ? Math.max(170, Math.min(value, 420, (layout.current?.clientWidth || 1200) - branchWidth - previous[1 - index] - 12 - 180)) : width))
    return <div role="separator" aria-label={index ? '调整文件栏宽度' : '调整导航栏宽度'} aria-orientation="vertical" aria-valuemin={170} aria-valuemax={420} aria-valuenow={widths[index]} tabIndex={0} className="pe-divider"
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); change(widths[index] + (event.key === 'ArrowLeft' ? -16 : 16)) } }}
      onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId) }}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId) && event.buttons === 1 && layout.current) change(event.clientX - layout.current.getBoundingClientRect().left - branchWidth - (index ? widths[0] + 6 : 0)) }} />
  }
  const navigationError = mode === 'tree' ? tree.error : mode === 'history' ? history.error : changes.error
  const busy = mode === 'tree' ? tree.isFetching : mode === 'history' ? history.isFetching : changes.isFetching
  return <Dialog.Root open onOpenChange={open => { if (!open && !operationBusy) onClose() }}><Dialog.Portal container={portal}>
    <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
    <Dialog.Content aria-describedby="project-explorer-description" className="pe-dialog fixed left-1/2 top-1/2 z-50 flex h-[94dvh] w-[96vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-[var(--color-background)] text-[var(--color-foreground)] shadow-lg"
      onOpenAutoFocus={event => { event.preventDefault(); heading.current?.focus() }}
      onEscapeKeyDown={event => { if (operationBusy) event.preventDefault() }}
      onInteractOutside={event => { if (operationBusy) event.preventDefault() }}
      onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus) restoreFocus(); else if (returnTo.current?.isConnected) returnTo.current.focus() }}>
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-3">
        <FolderTree className="size-5 shrink-0 text-[var(--color-primary)]" />
        <div className="min-w-0 flex-1"><Dialog.Title ref={heading} tabIndex={-1} className="truncate text-base font-semibold outline-none">{title} · 项目浏览器</Dialog.Title>
          <Dialog.Description id="project-explorer-description" className="text-xs text-[var(--color-muted-foreground)]">{info.data ? `${info.data.branch} · ${info.data.head.slice(0, 8) || '尚无提交'} · ` : ''}项目结构、提交历史与代码差异审阅{renderGitActions ? ' · 支持项目 Git 操作' : ' · 只读'}</Dialog.Description></div>
        <Button variant="ghost" size="icon" disabled={operationBusy} aria-label="刷新审阅数据" onClick={() => { setTreeRef('HEAD'); setOffset(0); setCommit(''); setSelected(null); setStage('navigation'); void client.invalidateQueries({ queryKey: prefix }) }}><RefreshCw className="size-4" /></Button>
        <Dialog.Close asChild><Button variant="ghost" size="icon" disabled={operationBusy} aria-label="关闭项目浏览器"><X className="size-4" /></Button></Dialog.Close>
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {modes.map(item => <Button key={item.id} size="sm" disabled={operationBusy} variant={mode === item.id ? 'secondary' : 'ghost'} aria-pressed={mode === item.id} onClick={() => chooseMode(item.id)}><item.icon className="size-4" />{item.label}</Button>)}
        {renderGitActions && <Button size="sm" disabled={operationBusy} variant={mode === 'operations' ? 'secondary' : 'ghost'} aria-pressed={mode === 'operations'} onClick={() => chooseMode('operations')}><GitBranch className="size-4" />Git 操作</Button>}
        {!!fetchRepos && <select aria-label="当前关联仓库" disabled={operationBusy} value={repo} onChange={event => { setRepo(event.target.value); clearSelection() }} className="max-w-56 rounded border bg-[var(--color-background)] px-2 py-1 text-xs">
          {repositories.data?.map(item => <option key={item.name} value={item.name}>{item.label}</option>)}
        </select>}
        {mode === 'workspace' && <select aria-label="工作区比较层" value={layer} onChange={event => { setLayer(event.target.value); setSelected(null); setStage('files') }} className="rounded border bg-[var(--color-background)] px-2 py-1 text-xs"><option value="combined">整体：HEAD → 当前文件</option><option value="index">已暂存：HEAD → 暂存区</option><option value="worktree">未暂存：暂存区 → 当前文件</option></select>}
      </div>
      {fetchRepos && repositories.isError && <Failure error={repositories.error} retry={() => void repositories.refetch()} />}
      {fetchRepos && repositories.data?.length === 0 && <p role="status" className="p-4 text-sm">当前项目没有关联的 Git 仓库，可关闭后检查项目目录。</p>}
      {operationBusy && <p role="status" className="px-4 py-2 text-sm">推送进行中，请等待结果后关闭。</p>}
      {mode === 'operations' ? <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-4 md:p-6">{renderGitActions?.(setOperationBusy)}</div> : <div ref={layout} className={cn('pe-layout min-h-0 flex-1', mode === 'history' && 'pe-history-layout')} style={{ '--pe-nav': `${widths[0]}px`, '--pe-files': `${widths[1]}px` } as CSSProperties}>
        {mode === 'history' && <BranchList branches={branches.data ?? []} selected={branchRef} onSelect={chooseBranch} />}
        <aside className={cn('pe-pane', stage !== 'navigation' && 'pe-mobile-hidden')} aria-label="项目导航">
          <div className="border-b p-3"><p className="mb-2 text-xs font-medium text-[var(--color-muted-foreground)]">{mode === 'tree' ? 'HEAD 已跟踪目录' : mode === 'history' ? `提交历史 · ${selectedBranch?.name || 'HEAD'}` : '当前工作区'}</p>
            {mode === 'history' && <select aria-label="筛选分支" value={branchRef} onChange={event => chooseBranch(event.target.value)} className="mb-2 w-full rounded border bg-[var(--color-background)] px-2 py-2 text-xs"><option value="">当前分支 · HEAD</option><optgroup label="本地分支">{branches.data?.filter(item => !item.remote).map(item => <option key={item.ref} value={item.ref}>{item.name}{item.current ? ' · 当前' : ''}</option>)}</optgroup><optgroup label="远端分支">{branches.data?.filter(item => item.remote).map(item => <option key={item.ref} value={item.ref}>{item.name}</option>)}</optgroup></select>}
            {mode !== 'tree' && <input aria-label={mode === 'history' ? '搜索已加载提交' : '搜索变更文件'} value={search} onChange={event => setSearch(event.target.value)} placeholder={mode === 'history' ? '搜索已加载信息、作者、Hash' : '搜索文件路径'} className="w-full rounded border bg-transparent px-2 py-2 text-xs" />}
          </div>
          {mode === 'history' && branches.isError && <Failure error={branches.error} retry={() => void branches.refetch()} />}
          {mode === 'history' && branchRef && !historyHead && !branches.isFetching && <p role="status" className="p-3 text-xs">{selectedBranch ? '此分支尚无提交。' : '所选分支已不存在，请刷新分支列表。'}</p>}
          {navigationError && <Failure error={navigationError} retry={() => mode === 'tree' ? void tree.refetch() : mode === 'history' ? void history.refetch() : void changes.refetch()} />}
          {busy && !navigationError && <p role="status" className="flex items-center gap-2 p-3 text-xs"><Loader2 className="size-3 animate-spin" />读取中…</p>}
          {mode === 'tree' && <div className="min-h-0 flex-1 overflow-auto p-2"><FolderNode endpoint={endpoint} repo={repo} path="" label="项目根目录" refId={tree.data?.ref || 'HEAD'} selected={folder} onSelect={openFolder} ready={ready} /></div>}
          {mode === 'history' && <div className="min-h-0 flex-1"><Virtuoso data={shownCommits} itemContent={(_, item) => <button className={cn('w-full border-b px-3 py-2 text-left text-xs hover:bg-[var(--color-muted)]', commit === item.hash && 'bg-[var(--color-accent)]')} aria-pressed={commit === item.hash}
            onClick={() => { setCommit(item.hash); setSelected(null); setStage('files') }}><strong className="block break-words text-sm font-medium">{item.subject}</strong><span className="mt-1 block text-[var(--color-muted-foreground)]">{item.author} · {new Date(item.date).toLocaleString()} · <code>{item.shortHash}</code></span></button>}
            components={{ Footer: () => history.hasNextPage ? <Button variant="ghost" className="w-full" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>加载更多提交</Button> : <p className="p-3 text-xs text-[var(--color-muted-foreground)]">{commits.length ? `已加载 ${commits.length} 条` : '暂无提交'}</p> }} /></div>}
          {mode === 'workspace' && <div className="p-3 text-sm"><p>未提交变更 · {files.length} 个文件</p><p className="my-3 text-xs text-[var(--color-muted-foreground)]">变更来自本地当前状态。刷新可重新核对，浏览不会更新工作文件或暂存区。</p><Button variant="outline" size="sm" onClick={() => setStage('files')}>查看变更文件</Button></div>}
        </aside>
        {separator(0)}
        <section className={cn('pe-pane', stage !== 'files' && 'pe-mobile-hidden')} aria-label="文件清单">
          <div className="shrink-0 border-b p-3"><button className="mb-2 flex items-center gap-1 text-xs md:hidden" onClick={() => setStage('navigation')}><ArrowLeft className="size-3" />返回项目导航</button>
            <p className="break-all text-xs font-medium">{mode === 'tree' ? folder || '项目根目录' : mode === 'history' ? commit ? `提交 ${commit.slice(0, 8)}` : '请选择一条提交' : '未提交文件'}</p>
            {mode === 'history' && commitDetail.data && <div className="mt-2 space-y-1 text-xs"><p className="break-words font-medium">{commitDetail.data.subject}</p><p className="text-[var(--color-muted-foreground)]">{commitDetail.data.author} · {new Date(commitDetail.data.date).toLocaleString()}</p>{commitDetail.data.body && <details><summary className="cursor-pointer">提交说明</summary><p className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words">{commitDetail.data.body}</p></details>}</div>}
            {mode === 'history' && commitDetail.isError && <Failure error={commitDetail.error} retry={() => void commitDetail.refetch()} />}
            {mode !== 'tree' && <p className="mt-2 flex flex-wrap gap-2 text-xs text-[var(--color-muted-foreground)]">{counts.map(([code, label, count]) => <span key={code}>{label} {count}</span>)}</p>}
          </div>
          {mode === 'tree' ? <div className="min-h-0 flex-1 overflow-auto">
            {!!folder && <button className="pe-file-row" onClick={() => openFolder(folder.split('/').slice(0, -1).join('/'), tree.data?.ref || treeRef)}><ArrowLeft className="size-4" />上级目录</button>}
            {tree.data?.entries.map(item => <button key={item.path} className={cn('pe-file-row', selected?.path === item.path && 'bg-[var(--color-accent)]')} title={item.path}
              onClick={() => item.type === 'tree' ? openFolder(item.path, tree.data!.ref) : openFile(item.path, tree.data!.ref, false)}>
              {item.type === 'tree' ? <Folder className="size-4 shrink-0" /> : <FileCode2 className="size-4 shrink-0" />}<span className="min-w-0 break-all">{item.name}</span>{item.type === 'link' && <span className="text-[10px]">链接</span>}
            </button>)}
            {tree.data && !tree.data.entries.length && <p className="p-3 text-sm text-[var(--color-muted-foreground)]">{tree.data.ref ? '此目录没有可见文件' : '尚无提交，未跟踪文件请查看工作区变更'}</p>}
            {(offset > 0 || tree.data?.hasMore) && <div className="flex gap-2 p-2"><Button variant="ghost" size="sm" disabled={!offset} onClick={() => setOffset(value => Math.max(0, value - 300))}>上一页</Button><Button variant="ghost" size="sm" disabled={!tree.data?.hasMore} onClick={() => { setTreeRef(tree.data!.ref); setOffset(value => value + 300) }}>下一页</Button></div>}
          </div> : <>
            {changes.isError && <Failure error={changes.error} retry={() => void changes.refetch()} />}
            <div className="min-h-0 flex-1"><Virtuoso data={shownFiles} itemContent={(index, file) => <div>
              {(index === 0 || directory(shownFiles[index - 1].path) !== directory(file.path)) && <p className="break-all bg-[var(--color-muted)] px-3 py-2 text-[11px] text-[var(--color-muted-foreground)]">{directory(file.path) || '/'}</p>}
              <button className={cn('pe-file-row', selected?.path === file.path && 'bg-[var(--color-accent)]')} onClick={() => openFile(file.path, mode === 'workspace' ? 'WORKTREE' : commit, true)} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>
                <Status change={file} /><span className="min-w-0 break-all">{file.path.split('/').pop()}{file.oldPath && <small className="mt-1 block text-[var(--color-muted-foreground)]">原：{file.oldPath}</small>}</span>
              </button></div>} components={{ Footer: () => currentFiles && !changes.isFetching && !changes.isError && !files.length ? <p className="p-3 text-sm text-[var(--color-muted-foreground)]">此范围没有变更</p> : null }} /></div>
          </>}
        </section>
        {separator(1)}
        <section className={cn('pe-pane', stage !== 'code' && 'pe-mobile-hidden')} aria-label="代码审阅">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b p-3">
            <button className="flex items-center gap-1 text-xs md:hidden" onClick={() => setStage('files')}><ArrowLeft className="size-3" />返回文件</button>
            <p className="min-w-0 flex-1 break-all font-mono text-xs">{selected?.path ?? '选择文件查看源码或差异'}</p>
            {selected?.diff && <div className="flex gap-1"><Button size="sm" variant={codeMode === 'unified' ? 'secondary' : 'ghost'} onClick={() => setCodeMode('unified')}>统一</Button><Button size="sm" variant={codeMode === 'split' ? 'secondary' : 'ghost'} onClick={() => setCodeMode('split')}>左右</Button></div>}
            {content.data && !content.data.notice && <><Button size="sm" variant="ghost" aria-label="复制当前代码" disabled={content.data.status === 'D'} onClick={() => void copy(content.data!.after)}><Copy className="size-3.5" />复制</Button>{selected?.diff && <Button size="sm" variant="ghost" onClick={() => void copy(content.data!.before)}>复制旧版</Button>}</>}
          </div>
          {feedback && <p role="status" className="px-3 py-2 text-xs">{feedback}</p>}
          {content.isFetching && <p role="status" className="p-4 text-sm">正在读取文件…</p>}
          {content.isError && <Failure error={content.error} retry={() => void content.refetch()} />}
          {content.data?.status === 'D' && <p className="border-b px-3 py-2 text-xs text-[var(--color-destructive)]">已删除文件，以下保留删除前内容。</p>}
          {content.data?.notice ? <p role="status" className="p-4 text-sm">{content.data.notice}</p> : content.data && <div className="min-h-0 flex-1"><ReviewCode key={`${selected?.ref}:${selected?.path}:${layer}`} path={selected!.path} before={content.data.before} after={content.data.after} mode={selected?.diff ? codeMode : 'source'} /></div>}
          {!selected && <div className="p-6 text-sm leading-6 text-[var(--color-muted-foreground)]">从目录选择源码，或选中提交后查看文件差异。审阅区域只读{renderGitActions ? '；项目 Git 操作请使用上方入口。' : '，不会编辑文件或执行 Git 写操作。'}</div>}
        </section>
      </div>}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>
}

function directory(path: string) { return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '' }
function Status({ change }: { change: ReviewChange }) {
  return <span className={cn('pe-status', change.status === 'A' && 'pe-added', change.status === 'D' && 'pe-deleted')} title={`暂存区 ${change.x || '—'} · 工作树 ${change.y || '—'}`}><b>{change.status}</b><span>{change.x === '?' ? '未跟踪' : statusNames[change.status] ?? '变更'}</span></span>
}
function Failure({ error, retry }: { error: unknown; retry: () => void }) {
  return <div role="alert" className="p-3 text-sm"><p className="break-words">{errorText(error)}</p><Button variant="outline" size="sm" className="mt-2" onClick={retry}>重试读取</Button></div>
}
function FolderNode({ endpoint, repo, refId, path, label, selected, onSelect, ready }: { endpoint: string; repo: string; refId: string; path: string; label: string; selected: string; onSelect: (path: string, ref: string) => void; ready: boolean }) {
  const [expanded, setExpanded] = useState(path === '')
  const query = useQuery({ queryKey: ['project-explorer', endpoint, repo, 'folders', refId, path],
    queryFn: ({ signal }) => reviewRequest<ReviewTree>(endpoint, repo, 'tree', { ref: refId, path }, signal), enabled: expanded && ready, retry: false })
  return <div><div className="flex min-w-0 items-center"><button aria-label={`${expanded ? '收起' : '展开'} ${label}`} aria-expanded={expanded} className="shrink-0 p-2" onClick={() => setExpanded(value => !value)}><ChevronRight className={cn('size-3 transition-transform', expanded && 'rotate-90')} /></button>
    <button className={cn('flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-2 text-left text-xs hover:bg-[var(--color-muted)]', path === selected && 'bg-[var(--color-accent)]')} onClick={() => onSelect(path, query.data?.ref || refId)} title={path}><Folder className="size-3.5 shrink-0" /><span className="truncate">{label}</span></button></div>
    {expanded && <div className="ml-3 border-l pl-1">{query.error && <Failure error={query.error} retry={() => void query.refetch()} />}{query.data?.entries.filter(entry => entry.type === 'tree').map(entry => <FolderNode key={`${query.data?.ref}:${entry.path}`} {...{ endpoint, repo, selected, onSelect, ready }} refId={query.data!.ref} path={entry.path} label={entry.name} />)}{query.data?.hasMore && <button className="p-2 text-xs underline" onClick={() => onSelect(path, query.data!.ref)}>在文件栏分页查看更多</button>}</div>}
  </div>
}
