import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, Copy, FileText, Folder, GitBranch, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import * as Dialog from '@radix-ui/react-dialog'
import { GitPushToolbar } from './GitPushToolbar'
import { GitBranchPicker } from './GitBranchPicker'
import { GitStatusPanel } from './GitStatusPanel'
import type { GitStatusResponse, GitFileDiffResponse } from './types'
import type { CommitDiff, CommitInfo, GitRepoRef, GitBranchRef, GitPushActions, GitPullActions, GitWorkspaceActions, GitWorkspaceStatus, GitBranchSwitchPreview } from './types'

interface Props {
  title: string
  fetchCommits: (repo?: string, branch?: string, offset?: number, expectedHead?: string) => Promise<CommitInfo[]>
  pageSize?: number
  fetchBranches?: (repo?: string) => Promise<GitBranchRef[]>
  fetchDiff: (hash: string, repo?: string) => Promise<CommitDiff>
  onClose: () => void
  fetchRepos?: () => Promise<GitRepoRef[]>
  pushActions?: GitPushActions
  pullActions?: GitPullActions
  workspaceActions?: GitWorkspaceActions
  fetchStatus?: (repo?: string) => Promise<GitStatusResponse>
  fetchFileDiff?: (filePath: string, x: string, repo?: string) => Promise<GitFileDiffResponse>
  restoreFocus?: () => void
  initialRepo?: string
  onRepoChange?: (repo: string) => void
}

/** 单一覆盖层中的仓库概览、分支选择、历史及 diff；工作目录管理由宿主独立提供。 */
export function CommitsPanel({ title, fetchCommits, fetchDiff, onClose, fetchRepos, fetchBranches, pushActions, pullActions, workspaceActions, fetchStatus, fetchFileDiff, restoreFocus, initialRepo, onRepoChange, pageSize }: Props) {
  const returnFocus = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const callbacks = useRef({ fetchRepos, fetchBranches, fetchCommits, fetchDiff, workspaceActions })
  callbacks.current = { fetchRepos, fetchBranches, fetchCommits, fetchDiff, workspaceActions }
  const [pushing, setPushing] = useState(false)
  const [showChanges, setShowChanges] = useState(false)
  const [repos, setRepos] = useState<GitRepoRef[] | null>(null)
  const [activeRepo, setActiveRepo] = useState<string>()
  const [branches, setBranches] = useState<GitBranchRef[] | null>(null)
  const [activeBranch, setActiveBranch] = useState<string>()
  const [branchError, setBranchError] = useState('')
  const [notice, setNotice] = useState('')
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [listErr, setListErr] = useState('')
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [workspace, setWorkspace] = useState<GitWorkspaceStatus | null>(null)
  const [workspaceError, setWorkspaceError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [syncRevision, setSyncRevision] = useState(0)
  const [switchPreview, setSwitchPreview] = useState<GitBranchSwitchPreview | null>(null)
  const [view, setView] = useState<'overview' | 'branches' | 'history' | 'diff'>('overview')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const previousView = useRef(view)
  useEffect(() => {
    if (previousView.current !== view) titleRef.current?.focus({ preventScroll: true })
    previousView.current = view
  }, [view])
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [diffErr, setDiffErr] = useState('')
  const [diffLoading, setDiffLoading] = useState(false)
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null)
  const listGeneration = useRef(0), diffGeneration = useRef(0), repositoryGeneration = useRef(0)
  const busyRef = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const scrollPositions = useRef(new Map<string, number>())
  const scrollKey = `${activeRepo ?? ''}:${activeBranch ?? ''}:${view}`
  useLayoutEffect(() => { if (scroller.current) scroller.current.scrollTop = scrollPositions.current.get(scrollKey) ?? 0 }, [scrollKey, commits, diff])
  const setBusy = useCallback((value: boolean) => { busyRef.current = value; setPushing(value) }, [])

  const loadCommits = useCallback(async (repo?: string, branch?: string) => {
    const current = ++listGeneration.current
    diffGeneration.current++
    setCommits(null); setListErr(''); setMore(false); setLoadingMore(false); setDiff(null); setDiffErr(''); setSelectedCommit(null); setDiffLoading(false)
    try {
      const result = await callbacks.current.fetchCommits(repo, branch)
      if (current === listGeneration.current) { setCommits(result); setMore(!!pageSize && result.length === pageSize) }
    } catch (error) { if (current === listGeneration.current) setListErr(message(error)) }
  }, [pageSize])

  const loadMore = async () => {
    if (!commits?.length || loadingMore || busyRef.current) return
    const current = ++listGeneration.current
    setLoadingMore(true); setListErr('')
    try {
      const result = await callbacks.current.fetchCommits(activeRepo, activeBranch, commits.length, commits[0].hash)
      if (current !== listGeneration.current) return
      setCommits(previous => [...(previous ?? []), ...result]); setMore(result.length === pageSize)
    } catch (error) { if (current === listGeneration.current) setListErr(message(error)) }
    finally { if (current === listGeneration.current) setLoadingMore(false) }
  }

  const loadRepository = useCallback(async (repo?: string, preferred?: string, remote = false) => {
    const current = ++repositoryGeneration.current
    listGeneration.current++; diffGeneration.current++
    setBranches(null); setBranchError(''); setWorkspace(null); setWorkspaceError(''); setActiveBranch(undefined)
    setCommits(null); setListErr(''); setDiff(null); setDiffErr(''); setDiffLoading(false); setSelectedCommit(null)
    setRefreshing(true)
    // Remote refresh precedes reading refs, so the branch list and history share the fetched view.
    try {
      if (callbacks.current.workspaceActions) {
        try {
          const result = await callbacks.current.workspaceActions.status(repo, remote)
          if (current !== repositoryGeneration.current) return
          setWorkspace(result)
        } catch (error) { if (current === repositoryGeneration.current) setWorkspaceError(message(error)) }
      }
      if (current !== repositoryGeneration.current) return
      let selected: GitBranchRef | undefined
      if (callbacks.current.fetchBranches) {
        try {
          const result = await callbacks.current.fetchBranches(repo)
          if (current !== repositoryGeneration.current) return
          setBranches(result)
          selected = result.find(branch => branch.ref === preferred) ?? result.find(branch => branch.current) ?? result[0]
          if (preferred && selected?.ref !== preferred) setNotice('原查看分支已不存在，已返回当前分支。')
        } catch (error) { if (current === repositoryGeneration.current) setBranchError(message(error)) }
      }
      if (current !== repositoryGeneration.current) return
      setActiveBranch(selected?.ref)
      await loadCommits(repo, selected?.ref)
    } finally { if (current === repositoryGeneration.current) setRefreshing(false) }
  }, [loadCommits])

  const loadRepos = useCallback(async () => {
    const current = ++repositoryGeneration.current
    setListErr(''); setCommits(null)
    if (!callbacks.current.fetchRepos) { await loadRepository(undefined); return }
    try {
      const result = await callbacks.current.fetchRepos()
      if (current !== repositoryGeneration.current) return
      setRepos(result)
      const first = result.find(repo => repo.name === initialRepo)?.name ?? result[0]?.name
      setActiveRepo(first)
      if (!result.length) setListErr('关联目录中没有 Git 仓库，可关闭后在工作区管理中检查目录。')
      else await loadRepository(first)
    } catch (error) { if (current === repositoryGeneration.current) setListErr(message(error)) }
  }, [initialRepo, loadRepository])

  useEffect(() => {
    void loadRepos()
    return () => { repositoryGeneration.current++; listGeneration.current++; diffGeneration.current++ }
  }, [loadRepos])

  const refresh = async () => {
    if (busyRef.current || refreshing) return
    setBusy(true); setNotice(''); setSwitchPreview(null)
    try { await loadRepository(activeRepo, activeBranch, true); setSyncRevision(value => value + 1) }
    finally { setBusy(false) }
  }
  const selectRepo = (name: string) => {
    if (busyRef.current || name === activeRepo) return
    setActiveRepo(name); onRepoChange?.(name); setView('overview'); setSwitchPreview(null); setNotice('')
    void loadRepository(name)
  }
  const selectBranch = (ref: string) => {
    if (busyRef.current) return
    setActiveBranch(ref); setView('history'); setSwitchPreview(null); setNotice('')
    void loadCommits(activeRepo, ref)
  }
  const prepareSwitch = async (ref: string) => {
    if (busyRef.current || !workspaceActions) return
    setBusy(true); setNotice(''); setSwitchPreview(null)
    try { setSwitchPreview(await workspaceActions.prepareSwitch(ref, activeRepo)) }
    catch (error) { setNotice(message(error)) }
    finally { setBusy(false) }
  }
  const executeSwitch = async () => {
    if (busyRef.current || !workspaceActions || !switchPreview) return
    setBusy(true)
    try {
      const result = await workspaceActions.switchBranch(switchPreview.ref, switchPreview.token, activeRepo)
      setSwitchPreview(null); setView('overview'); setNotice(result.message)
      await loadRepository(activeRepo); setSyncRevision(value => value + 1)
    } catch (error) { setSwitchPreview(null); setNotice(`${message(error)}。请刷新核对实际分支，不会自动重试。`) }
    finally { setBusy(false) }
  }
  const openDiff = async (commit: CommitInfo) => {
    if (busyRef.current) return
    const current = ++diffGeneration.current
    setView('diff'); setSelectedCommit(commit); setDiff(null); setDiffErr(''); setDiffLoading(true)
    try {
      const result = await callbacks.current.fetchDiff(commit.hash, activeRepo)
      if (current === diffGeneration.current) setDiff(result)
    } catch (error) { if (current === diffGeneration.current) setDiffErr(message(error)) }
    finally { if (current === diffGeneration.current) setDiffLoading(false) }
  }
  const copyBranch = async (name: string) => {
    try { await navigator.clipboard.writeText(name); setNotice('已复制分支名称') }
    catch { setNotice('复制失败，可选中分支名称复制。') }
  }
  const back = () => {
    diffGeneration.current++; setDiffLoading(false); setSwitchPreview(null)
    setView(view === 'diff' ? 'history' : 'overview')
  }
  const currentBranch = branches?.find(branch => branch.current)
  const viewedBranch = branches?.find(branch => branch.ref === activeBranch)
  const viewingCurrent = !fetchBranches || !!branchError || !!viewedBranch?.current
  const repoLabel = repos?.find(repo => repo.name === activeRepo)?.label ?? title
  const ready = !fetchRepos || !!repos?.length
  const showSync = ready && (view === 'overview' || (view === 'history' && viewingCurrent))

  return <Dialog.Root open onOpenChange={open => { if (!open && !busyRef.current) onClose() }}>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
      <Dialog.Content aria-describedby={undefined}
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] min-h-0 flex-col overflow-hidden rounded-t-xl border bg-[var(--color-background)] pb-[env(safe-area-inset-bottom)] sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl"
        onPointerDownOutside={event => { if (busyRef.current) event.preventDefault() }}
        onEscapeKeyDown={event => { if (busyRef.current) event.preventDefault() }}
        onCloseAutoFocus={event => { event.preventDefault(); if (restoreFocus) restoreFocus(); else returnFocus.current?.focus() }}>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          {view !== 'overview' ? <button aria-label="返回列表" type="button" disabled={pushing} onClick={back} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-muted)] disabled:opacity-50"><ArrowLeft className="size-4" /></button> : <GitBranch className="size-4 shrink-0" />}
          <Dialog.Title ref={titleRef} tabIndex={-1} className="min-w-0 flex-1 text-sm font-semibold">{view === 'branches' ? '选择分支' : view === 'history' ? '提交历史' : view === 'diff' ? '提交详情' : '代码与分支'}</Dialog.Title>
          <button type="button" onClick={onClose} disabled={pushing} className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-muted)] disabled:opacity-50" aria-label="关闭"><X className="size-4" /></button>
        </header>
        <div ref={scroller} onScroll={event => scrollPositions.current.set(scrollKey, event.currentTarget.scrollTop)} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {view === 'overview' && <section className="space-y-3 border-b px-4 py-3">
            <div className="flex min-w-0 items-center justify-between gap-3 text-[13px]"><span className="shrink-0 text-[var(--color-muted-foreground)]">当前工作区</span><span className="min-w-0 break-all text-right font-medium">{repoLabel}</span></div>
            {repos && repos.length > 1 && <div role="group" aria-label="选择仓库" className="flex flex-wrap gap-1">
              {repos.map(repo => <button type="button" key={repo.name} disabled={pushing} aria-pressed={repo.name === activeRepo} onClick={() => selectRepo(repo.name)} className={cn('min-h-11 max-w-full rounded-md border px-3 py-2 text-left text-[13px] [overflow-wrap:anywhere]', repo.name === activeRepo && 'border-[var(--color-primary)] text-[var(--color-primary)]')}>{repo.label}</button>)}
            </div>}
            {fetchBranches && <div>
              <div className="text-[13px] text-[var(--color-muted-foreground)]">当前分支</div>
              <div className="flex min-w-0 items-start gap-1">
                <span className="min-w-0 flex-1 break-all py-3 text-sm font-medium">{currentBranch?.name ?? workspace?.branch ?? (branchError ? '暂不可用' : '读取中…')}</span>
                <button type="button" className="inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-[var(--color-muted)] disabled:opacity-50" aria-label="复制当前分支名称" disabled={!currentBranch} onClick={() => { void copyBranch(currentBranch!.name) }}><Copy className="size-4" /></button>
                <button type="button" className="min-h-11 shrink-0 whitespace-nowrap rounded-md border px-3 text-[13px] disabled:opacity-50" disabled={pushing || !branches} onClick={() => setView('branches')}>选择分支</button>
              </div>
            </div>}
          </section>}
          {branchError && <p role="alert" className="px-4 py-2 text-[13px] text-[var(--color-destructive)]">分支列表暂不可用，当前显示工作分支。{branchError}；可刷新重试。</p>}
          {workspaceError && <p role="alert" className="px-4 py-2 text-[13px] text-[var(--color-destructive)]">同步状态未核验：{workspaceError}</p>}
          {notice && <p role="status" className="break-words px-4 py-2 text-[13px]">{notice}</p>}
          {!showSync && ready && view !== 'diff' && view !== 'branches' && <button type="button" disabled={pushing || refreshing} onClick={() => void refresh()} className="mx-4 mt-3 min-h-11 rounded-md border px-3 text-[13px]">刷新状态</button>}
          {showSync && pushActions && <GitPushToolbar key={activeRepo ?? ''} actions={pushActions} pullActions={pullActions} repo={activeRepo} workspace={workspace}
            refreshKey={syncRevision} refreshing={refreshing} onRefresh={() => void refresh()} onPending={setBusy}
            onShowChanges={fetchStatus && fetchFileDiff ? () => setShowChanges(true) : undefined} onShowHistory={() => setView('history')}
            onPushed={() => { void loadRepository(activeRepo, activeBranch) }} onPulled={() => { void loadRepository(activeRepo, activeBranch) }} />}
          {showSync && !pushActions && <button type="button" className="m-4 min-h-11 rounded-md border px-3 text-[13px]" disabled={pushing || refreshing} onClick={() => void refresh()}>刷新状态</button>}
          <div hidden={view !== 'branches'}><GitBranchPicker key={activeRepo ?? ''} branches={branches ?? []} busy={pushing} loading={refreshing} workspace={workspace} onRefresh={() => void refresh()} compare={workspaceActions?.compareBranches ? (base, ref) => workspaceActions.compareBranches!(base, ref, activeRepo) : undefined} selected={activeBranch} canSwitch={!!workspaceActions && !!workspace}
            onBrowse={selectBranch} onSwitch={ref => void prepareSwitch(ref)} onCopy={text => { void copyBranch(text) }} /></div>
          {view === 'branches' && switchPreview && <section aria-label="确认切换分支" className="space-y-2 border-t px-4 py-3 text-[13px]">
            <p className="break-all">从 {switchPreview.branch} 切换到 {switchPreview.localBranch}</p>
            <p className="break-all">{switchPreview.tracking ? `新建本地分支并跟踪 ${switchPreview.tracking}` : '切换到已有本地分支'} · 目标 {switchPreview.targetHead.slice(0, 8)}</p>
            <p>请先停止正在修改此仓库的 Agent；不会自动保存、暂存或覆盖本地改动。</p>
            <div className="flex gap-2"><button type="button" disabled={pushing} onClick={() => void executeSwitch()} className="min-h-11 rounded-md border px-3">确认切换</button><button type="button" disabled={pushing} onClick={() => setSwitchPreview(null)} className="min-h-11 px-3">取消</button></div>
          </section>}
          {(view === 'overview' || view === 'history') && <section className="px-4 py-3">
            <div className="mb-2 flex items-center justify-between gap-2"><h3 className="min-w-0 flex-1 break-all text-sm font-medium">{view === 'history' ? viewedBranch?.name ?? '当前分支' : '最近提交'}</h3>
              {view === 'overview' && <button type="button" disabled={pushing} onClick={() => setView('history')} className="flex min-h-11 shrink-0 items-center gap-1 text-[13px]">查看全部<ChevronRight className="size-3" /></button>}
              {view === 'history' && fetchBranches && <button type="button" disabled={pushing || !branches} onClick={() => setView('branches')} className="min-h-11 shrink-0 text-[13px]">选择分支</button>}
            </div>
            {view === 'history' && !viewingCurrent && <p className="mb-2 text-[13px] text-[var(--color-muted-foreground)]">只读查看，不切换工作分支 · 远端分支为本地已获取记录</p>}
            {listErr && <div role="alert" className="break-words text-[13px] text-[var(--color-destructive)]">{listErr}<button className="ml-3 min-h-11 underline" disabled={pushing} onClick={() => { if (repos?.length || !fetchRepos) void loadRepository(activeRepo, activeBranch); else void loadRepos() }}>重试</button></div>}
            {!commits && !listErr && <p className="py-3 text-[13px] text-[var(--color-muted-foreground)]">加载中…</p>}
            {commits?.length === 0 && <p className="py-3 text-[13px] text-[var(--color-muted-foreground)]">无提交记录</p>}
            <ul>{(view === 'overview' ? commits?.slice(0, 3) : commits)?.map(commit => <li key={commit.hash}>
              <button type="button" disabled={pushing} onClick={() => void openDiff(commit)} className="flex w-full min-w-0 flex-col gap-1 rounded-md py-3 text-left hover:bg-[var(--color-muted)] disabled:opacity-50">
                <span className="w-full break-words text-sm">{commit.subject}</span>
                {view === 'history' && commit.body && <span className="line-clamp-2 whitespace-pre-line text-[13px] text-[var(--color-muted-foreground)]">{commit.body}</span>}
                <span className="flex w-full flex-wrap gap-x-2 text-[13px] text-[var(--color-muted-foreground)]"><code>{commit.shortHash}</code><span>{formatDate(commit.date)}</span></span>
              </button>
            </li>)}</ul>
            {view === 'history' && <p className="mt-2 text-[13px] text-[var(--color-muted-foreground)]">已显示 {commits?.length ?? 0} 条提交。</p>}
            {view === 'history' && more && (!workspaceActions || !!workspace) && <button type="button" disabled={loadingMore || pushing} onClick={() => void loadMore()} className="mt-2 min-h-11 rounded-md border px-3 text-[13px]">{loadingMore ? '加载中…' : '加载更早提交'}</button>}
          </section>}
          {view === 'diff' && <div className="flex min-h-0 flex-col">
            {diffLoading && <p className="p-4 text-[13px]">加载 diff…</p>}
            {diffErr && <div role="alert" className="p-4 text-[13px] text-[var(--color-destructive)]">{diffErr}<button type="button" className="ml-2 min-h-11 underline" onClick={() => selectedCommit && void openDiff(selectedCommit)}>重试</button></div>}
            {diff && <><div className="space-y-2 border-b p-4"><h3 className="break-words text-sm font-medium">{selectedCommit?.subject ?? diff.subject}</h3>
              {selectedCommit?.body && <p className="whitespace-pre-wrap break-words text-[13px]">{selectedCommit.body}</p>}
              <p className="break-words text-[13px] text-[var(--color-muted-foreground)]">{diff.shortHash} · {diff.author} · {formatDate(diff.date)}{diff.truncated && '（diff 过大，已截断）'}</p></div>
              <DiffView key={diff.hash} text={diff.diff} /></>}
          </div>}
        </div>
        {showChanges && fetchStatus && fetchFileDiff && <GitStatusPanel title={repoLabel}
          fetchStatus={() => fetchStatus(activeRepo)} fetchFileDiff={(path, x) => fetchFileDiff(path, x, activeRepo)}
          onClose={() => setShowChanges(false)} />}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>
}

function message(error: unknown) { return error instanceof Error ? error.message : String(error) }

interface FileDiff {
  path: string
  body: string
  additions: number
  deletions: number
}

/** 把 git show 的整段 patch 按 `diff --git` 边界拆成单文件块，并统计每文件 +/- 行数。 */
function parseFiles(text: string): FileDiff[] {
  const start = text.startsWith('diff --git ')
    ? 0
    : (text.indexOf('\ndiff --git ') >= 0 ? text.indexOf('\ndiff --git ') + 1 : -1)
  if (start < 0) return []
  const patch = text.slice(start)
  const blocks = patch.split(/\n(?=diff --git )/)
  return blocks.map(block => {
    const first = block.slice(0, block.indexOf('\n') >= 0 ? block.indexOf('\n') : block.length)
    const m = first.match(/^diff --git a\/(.+) b\/(.+)$/)
    const path = m ? m[2] : first.replace(/^diff --git\s*/, '')
    let additions = 0
    let deletions = 0
    for (const l of block.split('\n')) {
      if (l.startsWith('+') && !l.startsWith('+++')) additions++
      else if (l.startsWith('-') && !l.startsWith('---')) deletions++
    }
    return { path, body: block, additions, deletions }
  })
}

// ---- 目录树 ----
type TreeNode =
  | { kind: 'dir'; name: string; path: string; children: TreeNode[]; fileCount: number }
  | { kind: 'file'; name: string; path: string; file: FileDiff }

interface RawDir { dirs: Map<string, RawDir>; files: { name: string; file: FileDiff }[] }

/** 由文件列表构建目录树，并压缩「单子目录链」为一段路径（IDE compact 风格）。 */
function buildTree(files: FileDiff[]): TreeNode[] {
  const root: RawDir = { dirs: new Map(), files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    const fileName = parts.pop() ?? f.path
    let node = root
    for (const p of parts) {
      let next = node.dirs.get(p)
      if (!next) { next = { dirs: new Map(), files: [] }; node.dirs.set(p, next) }
      node = next
    }
    node.files.push({ name: fileName, file: f })
  }
  const countFiles = (nodes: TreeNode[]): number =>
    nodes.reduce((s, n) => s + (n.kind === 'file' ? 1 : n.fileCount), 0)
  const convert = (dirs: Map<string, RawDir>, fileList: RawDir['files'], prefix: string): TreeNode[] => {
    const out: TreeNode[] = []
    for (const [name, child] of [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      let dirName = name
      let cur = child
      let path = prefix ? `${prefix}/${name}` : name
      // 压缩单子目录链：只有一个子目录且无文件时合并显示
      while (cur.dirs.size === 1 && cur.files.length === 0) {
        const [onlyName, onlyChild] = [...cur.dirs.entries()][0]
        dirName = `${dirName}/${onlyName}`
        path = `${path}/${onlyName}`
        cur = onlyChild
      }
      const children = convert(cur.dirs, cur.files, path)
      out.push({ kind: 'dir', name: dirName, path, children, fileCount: countFiles(children) })
    }
    for (const ff of [...fileList].sort((a, b) => a.name.localeCompare(b.name))) {
      out.push({ kind: 'file', name: ff.name, path: prefix ? `${prefix}/${ff.name}` : ff.name, file: ff.file })
    }
    return out
  }
  return convert(root.dirs, root.files, '')
}

function allDirPaths(nodes: TreeNode[], acc: string[] = []): string[] {
  for (const n of nodes) if (n.kind === 'dir') { acc.push(n.path); allDirPaths(n.children, acc) }
  return acc
}

/** 按目录树展示 diff：文件夹可折叠（带文件数），点文件叶子展开其着色 diff。 */
function DiffView({ text }: { text: string }) {
  const files = useMemo(() => parseFiles(text), [text])
  const tree = useMemo(() => buildTree(files), [files])
  const [openDirs, setOpenDirs] = useState<Set<string>>(() => new Set(allDirPaths(tree)))
  const [openFile, setOpenFile] = useState<string | null>(null)

  if (files.length === 0) {
    // 解析不出文件（空 diff / 合并提交等）→ 退化为整体着色
    return (
      <pre className="flex-1 overflow-auto bg-[var(--color-muted)]/30 p-3 text-[11px] leading-relaxed">
        {text.split('\n').map((line, i) => (
          <div key={i} className={lineClass(line)}>{line || ' '}</div>
        ))}
      </pre>
    )
  }

  const toggleDir = (p: string) => setOpenDirs(prev => {
    const n = new Set(prev)
    if (n.has(p)) n.delete(p)
    else n.add(p)
    return n
  })
  const toggleFile = (p: string) => setOpenFile(cur => (cur === p ? null : p))

  return (
    <div className="flex-1 overflow-auto py-1">
      <TreeNodes nodes={tree} depth={0} openDirs={openDirs} openFile={openFile} onToggleDir={toggleDir} onToggleFile={toggleFile} />
    </div>
  )
}

function TreeNodes({ nodes, depth, openDirs, openFile, onToggleDir, onToggleFile }: {
  nodes: TreeNode[]
  depth: number
  openDirs: Set<string>
  openFile: string | null
  onToggleDir: (p: string) => void
  onToggleFile: (p: string) => void
}) {
  return (
    <>
      {nodes.map(n => n.kind === 'dir' ? (
        <div key={n.path}>
          <button
            type="button"
            onClick={() => onToggleDir(n.path)}
            style={{ paddingLeft: depth * 14 + 8 }}
            className="flex w-full items-center gap-1.5 py-1 pr-3 text-left hover:bg-[var(--color-muted)]"
          >
            <ChevronRight className={cn('size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', openDirs.has(n.path) && 'rotate-90')} />
            <Folder className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <span className="truncate text-xs">{n.name}</span>
            <span className="ml-2 shrink-0 text-[11px] text-[var(--color-muted-foreground)]">{n.fileCount} 个文件</span>
          </button>
          {openDirs.has(n.path) && (
            <TreeNodes nodes={n.children} depth={depth + 1} openDirs={openDirs} openFile={openFile} onToggleDir={onToggleDir} onToggleFile={onToggleFile} />
          )}
        </div>
      ) : (
        <div key={n.path}>
          <button
            type="button"
            onClick={() => onToggleFile(n.path)}
            style={{ paddingLeft: depth * 14 + 8 }}
            className={cn('flex w-full items-center gap-1.5 py-1 pr-3 text-left hover:bg-[var(--color-muted)]', openFile === n.path && 'bg-[var(--color-muted)]')}
          >
            <FileText className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <span className="truncate font-mono text-xs">{n.name}</span>
            <span className="ml-auto shrink-0 space-x-1 font-mono text-[11px]">
              {n.file.additions > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{n.file.additions}</span>}
              {n.file.deletions > 0 && <span className="text-red-700 dark:text-red-400">-{n.file.deletions}</span>}
            </span>
          </button>
          {openFile === n.path && (
            <pre className="overflow-auto bg-[var(--color-muted)]/30 px-3 py-2 text-[11px] leading-relaxed">
              {n.file.body.split('\n').map((line, j) => (
                <div key={j} className={lineClass(line)}>{line || ' '}</div>
              ))}
            </pre>
          )}
        </div>
      ))}
    </>
  )
}

function lineClass(line: string): string {
  if (line.startsWith('diff --git') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
    return 'font-mono font-semibold text-[var(--color-muted-foreground)]'
  }
  if (line.startsWith('@@')) return 'font-mono text-cyan-600 dark:text-cyan-400'
  if (line.startsWith('+')) return 'font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-500/10'
  if (line.startsWith('-')) return 'font-mono text-red-700 dark:text-red-400 bg-red-500/10'
  return 'font-mono'
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
