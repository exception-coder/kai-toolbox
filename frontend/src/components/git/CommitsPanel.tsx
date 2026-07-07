import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, FileText, Folder, GitCommit, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommitDiff, CommitInfo, GitRepoRef } from './types'

interface Props {
  /** 弹层标题（如项目名 / 会话目录名） */
  title: string
  /** 拉取提交列表（repo 为可选子仓库定位，多仓库场景由本组件传入所选仓库） */
  fetchCommits: (repo?: string) => Promise<CommitInfo[]>
  /** 拉取某提交 diff */
  fetchDiff: (hash: string, repo?: string) => Promise<CommitDiff>
  onClose: () => void
  /**
   * 可选：列出可查看的 git 仓库。用于「父目录当工作目录、子目录才是 git 仓库」的场景
   * （taskspace 聚合 / 含多个项目的父目录）。返回 >1 个时顶部显示仓库切换；不传则按单仓（不带 repo）加载。
   */
  fetchRepos?: () => Promise<GitRepoRef[]>
}

/**
 * 通用 git 提交记录弹层：列最近提交，点某条看其 diff。数据源由 fetchCommits/fetchDiff 注入，
 * 与具体后端接口解耦，供 projects（按 path）/ claude-chat（按 sessionId）等复用。
 * 提供 fetchRepos 时支持在会话 cwd 下的多个 git 子仓库间切换查看。
 */
export function CommitsPanel({ title, fetchCommits, fetchDiff, onClose, fetchRepos }: Props) {
  const [repos, setRepos] = useState<GitRepoRef[] | null>(null)
  const [activeRepo, setActiveRepo] = useState<string | undefined>(undefined)
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [listErr, setListErr] = useState<string | null>(null)
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [diffErr, setDiffErr] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  // 载入某仓库的提交（repo=undefined 表示不带 repo：cwd 单仓 / projects 用法）
  const loadCommits = useCallback((repo: string | undefined) => {
    setCommits(null); setListErr(null); setDiff(null); setDiffErr(null)
    fetchCommits(repo)
      .then(setCommits)
      .catch(e => setListErr(e instanceof Error ? e.message : String(e)))
  }, [fetchCommits])

  // 初始化：有 fetchRepos 则先取仓库列表、选第一个并载入；否则直接不带 repo 载入。
  useEffect(() => {
    let alive = true
    if (!fetchRepos) { loadCommits(undefined); return () => { alive = false } }
    fetchRepos()
      .then(rs => {
        if (!alive) return
        setRepos(rs)
        const first = rs[0]?.name
        setActiveRepo(first)
        if (rs.length === 0) setListErr('会话目录及其子目录都不是 git 仓库')
        else loadCommits(first)
      })
      .catch(e => { if (alive) setListErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
    // 仅首次加载；fetchRepos/fetchCommits 由调用方 memo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectRepo = (name: string) => {
    if (name === activeRepo) return
    setActiveRepo(name)
    loadCommits(name)
  }

  const openDiff = (hash: string) => {
    setDiff(null)
    setDiffErr(null)
    setDiffLoading(true)
    fetchDiff(hash, activeRepo)
      .then(setDiff)
      .catch(e => setDiffErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDiffLoading(false))
  }

  const backToList = () => { setDiff(null); setDiffErr(null) }
  const showingDiff = diff !== null || diffErr !== null || diffLoading

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3"
      onClick={e => { e.stopPropagation(); onClose() }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border bg-[var(--color-background)] shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          {showingDiff && (
            <button type="button" onClick={backToList} className="rounded-md p-1 hover:bg-[var(--color-muted)]" aria-label="返回列表">
              <ArrowLeft className="size-4" />
            </button>
          )}
          <GitCommit className="size-4 text-[var(--color-primary)]" />
          <span className="truncate text-sm font-semibold">{title}</span>
          <span className="truncate text-xs text-[var(--color-muted-foreground)]">
            {showingDiff ? '提交差异' : '最近提交'}
          </span>
          <button type="button" onClick={onClose} className="ml-auto rounded-md p-1 hover:bg-[var(--color-muted)]" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        {/* 多个 git 子仓库（父目录当工作目录场景）：顶部切换要查看的仓库 */}
        {repos && repos.length > 1 && !showingDiff && (
          <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5">
            {repos.map(r => (
              <button
                key={r.name}
                type="button"
                onClick={() => selectRepo(r.name)}
                title={r.label}
                className={cn(
                  'shrink-0 rounded-full border px-2.5 py-1 text-xs',
                  r.name === activeRepo
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 font-medium text-[var(--color-primary)]'
                    : 'text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)]/40',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}

        {!showingDiff && (
          <div className="overflow-y-auto p-2">
            {listErr && <div className="p-3 text-sm text-[var(--color-destructive)]">{listErr}</div>}
            {!commits && !listErr && <div className="p-3 text-sm text-[var(--color-muted-foreground)]">加载中…</div>}
            {commits?.length === 0 && <div className="p-3 text-sm text-[var(--color-muted-foreground)]">无提交记录</div>}
            <ul className="flex flex-col">
              {commits?.map(c => (
                <li key={c.hash}>
                  <button
                    type="button"
                    onClick={() => openDiff(c.hash)}
                    className="flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-[var(--color-muted)]"
                  >
                    <span className="truncate text-sm">{c.subject}</span>
                    <span className="flex items-center gap-2 text-[11px] text-[var(--color-muted-foreground)]">
                      <code className="font-mono">{c.shortHash}</code>
                      <span className="truncate">{c.author}</span>
                      <span className="ml-auto shrink-0">{formatDate(c.date)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {showingDiff && (
          <div className="flex min-h-0 flex-1 flex-col">
            {diffLoading && <div className="p-3 text-sm text-[var(--color-muted-foreground)]">加载 diff…</div>}
            {diffErr && <div className="p-3 text-sm text-[var(--color-destructive)]">{diffErr}</div>}
            {diff && (
              <>
                <div className="border-b px-3 py-2 text-xs text-[var(--color-muted-foreground)]">
                  <code className="font-mono">{diff.shortHash}</code> · {diff.author} · {formatDate(diff.date)}
                  {diff.truncated && <span className="ml-2 text-[var(--color-destructive)]">（diff 过大，已截断）</span>}
                </div>
                <DiffView key={diff.hash} text={diff.diff} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

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
