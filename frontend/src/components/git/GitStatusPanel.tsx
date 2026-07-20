import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, File, Folder, RefreshCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GitStatusEntry, GitStatusResponse, GitFileDiffResponse } from '@/features/claude-chat/api'
import { SideBySideDiff } from './SideBySideDiff'

interface Props {
  title: string
  fetchStatus: (repo?: string) => Promise<GitStatusResponse>
  /** 获取单个文件的 diff */
  fetchFileDiff: (filePath: string, x: string) => Promise<GitFileDiffResponse>
  onClose: () => void
}

// ── 状态码语义 ────────────────────────────────────────────────────────────────

/** 从 x(暂存区) 和 y(工作树) 推导出展示用的单字符状态和颜色 */
function effectiveStatus(x: string, y: string): { code: string; label: string; cls: string } {
  // 未跟踪
  if (x === '?' && y === '?') return { code: '?', label: '未跟踪', cls: 'text-[var(--color-muted-foreground)] bg-[var(--color-muted)]' }
  // 暂存区状态优先（已 stage）
  if (x === 'A') return { code: 'A', label: '新增', cls: 'text-emerald-700 bg-emerald-100 dark:text-emerald-300 dark:bg-emerald-950' }
  if (x === 'D') return { code: 'D', label: '删除', cls: 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950' }
  if (x === 'R') return { code: 'R', label: '重命名', cls: 'text-violet-700 bg-violet-100 dark:text-violet-300 dark:bg-violet-950' }
  if (x === 'M') return { code: 'M', label: '已暂存修改', cls: 'text-sky-700 bg-sky-100 dark:text-sky-300 dark:bg-sky-950' }
  // 工作树（未 stage）
  if (y === 'M') return { code: 'M', label: '修改', cls: 'text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950' }
  if (y === 'D') return { code: 'D', label: '删除', cls: 'text-rose-700 bg-rose-100 dark:text-rose-300 dark:bg-rose-950' }
  return { code: x !== ' ' ? x : y, label: '变更', cls: 'text-[var(--color-muted-foreground)] bg-[var(--color-muted)]' }
}

// ── 文件树构建 ────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string       // 完整相对路径
  isDir: boolean
  entry?: GitStatusEntry
  children: TreeNode[]
}

function buildTree(entries: GitStatusEntry[]): TreeNode[] {
  const root: TreeNode = { name: '', path: '', isDir: true, children: [] }

  for (const e of entries) {
    const parts = e.path.replace(/\\/g, '/').split('/')
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isLast = i === parts.length - 1
      let child = cur.children.find(c => c.name === name)
      if (!child) {
        const path = parts.slice(0, i + 1).join('/')
        child = { name, path, isDir: !isLast, children: [] }
        cur.children.push(child)
      }
      if (isLast) child.entry = e
      cur = child
    }
  }

  // 排序：目录优先，同类按名
  function sort(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    nodes.forEach(n => sort(n.children))
  }
  sort(root.children)
  return root.children
}

/** 统计节点下所有叶子文件数 */
function countLeaves(node: TreeNode): number {
  if (!node.isDir) return 1
  return node.children.reduce((s, c) => s + countLeaves(c), 0)
}

// ── 树节点组件 ────────────────────────────────────────────────────────────────

function TreeRow({
  node,
  depth,
  collapsed,
  onToggle,
  onPickFile,
}: {
  node: TreeNode
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  onPickFile: (entry: GitStatusEntry) => void
}) {
  const isCollapsed = collapsed.has(node.path)
  const leafCount = countLeaves(node)
  const st = node.entry ? effectiveStatus(node.entry.x, node.entry.y) : null

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-1.5 rounded px-2 py-1 text-sm cursor-pointer select-none',
          node.isDir ? 'hover:bg-[var(--color-accent)]' : 'hover:bg-[var(--color-accent)] active:bg-[var(--color-primary)]/10',
        )}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => node.isDir ? onToggle(node.path) : node.entry && onPickFile(node.entry)}
        title={node.entry?.origPath ? `${node.entry.origPath} → ${node.entry.path}（点击查看 diff）` : `${node.path}（点击查看 diff）`}
      >
        {node.isDir ? (
          <>
            <ChevronRight
              className={cn('size-3.5 shrink-0 text-[var(--color-muted-foreground)] transition-transform', !isCollapsed && 'rotate-90')}
            />
            <Folder className="size-3.5 shrink-0 text-sky-500" />
            <span className="min-w-0 flex-1 truncate font-medium">{node.name}</span>
            <span className="shrink-0 text-[11px] tabular-nums text-[var(--color-muted-foreground)]">{leafCount}</span>
          </>
        ) : (
          <>
            <span className="size-3.5 shrink-0" />
            <File className="size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
            <span className="min-w-0 flex-1 truncate">
              {node.name}
              {node.entry?.origPath && (
                <span className="ml-1 text-[11px] text-[var(--color-muted-foreground)]">← {node.entry.origPath.split('/').pop()}</span>
              )}
            </span>
            {st && (
              <span className={cn('shrink-0 rounded px-1 py-0.5 text-[10px] font-bold leading-none', st.cls)} title={st.label}>
                {st.code}
              </span>
            )}
          </>
        )}
      </div>
      {node.isDir && !isCollapsed && (
        node.children.map(child => (
          <TreeRow key={child.path} node={child} depth={depth + 1} collapsed={collapsed} onToggle={onToggle} onPickFile={onPickFile} />
        ))
      )}
    </>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

export function GitStatusPanel({ title, fetchStatus, fetchFileDiff, onClose }: Props) {
  const [data, setData] = useState<GitStatusResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // ── diff 视图状态 ──────────────────────────────────────────────────────────
  const [diffEntry, setDiffEntry] = useState<GitStatusEntry | null>(null)
  const [diffData, setDiffData] = useState<{ diff: string; truncated: boolean } | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffErr, setDiffErr] = useState<string | null>(null)

  const openDiff = (entry: GitStatusEntry) => {
    setDiffEntry(entry)
    setDiffData(null)
    setDiffErr(null)
    setDiffLoading(true)
    fetchFileDiff(entry.path, entry.x)
      .then(r => setDiffData({ diff: r.diff, truncated: r.truncated }))
      .catch(e => setDiffErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setDiffLoading(false))
  }
  const closeDiff = () => { setDiffEntry(null); setDiffData(null); setDiffErr(null) }
  const showingDiff = diffEntry !== null

  const load = () => {
    setLoading(true)
    setErr(null)
    closeDiff()
    fetchStatus()
      .then(d => { setData(d); setCollapsed(new Set()) })
      .catch(e => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const tree = useMemo(() => (data ? buildTree(data.entries) : []), [data])

  const toggle = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path); else next.add(path)
      return next
    })
  }

  // 汇总统计
  const stats = useMemo(() => {
    if (!data) return null
    let modified = 0, added = 0, deleted = 0, untracked = 0, renamed = 0
    for (const e of data.entries) {
      if (e.x === '?' && e.y === '?') { untracked++; continue }
      if (e.x === 'A' || e.y === 'A') added++
      else if (e.x === 'D' || e.y === 'D') deleted++
      else if (e.x === 'R' || e.y === 'R') renamed++
      else modified++
    }
    return { total: data.entries.length, modified, added, deleted, untracked, renamed }
  }, [data])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16" onClick={onClose}>
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-xl border bg-[var(--color-card)] shadow-2xl',
          showingDiff
            // diff 视图：用固定 h-[]（而非 max-h-[]）撑出确定高度。
            // 原因：只给 max-height 时，容器自身高度是"content-auto、被 max-height 封顶"，
            // 当内容自然高度还没超过 85vh（比如只有二三十行差异）时 max-height 根本不会触发钳制，
            // 子级 flex-1/h-full 链条就拿不到一个"确定"的高度基准，
            // 导致内部 overflow-auto 面板既不裁剪也不出滚动条——多出来的行只是被外层
            // fixed 视口边缘悄悄裁掉，观感上就是"滚动条消失了"。
            // 固定 h-[85vh] 让高度在所有内容量下都是确定值，flex-1/h-full 链路能可靠地
            // 逐级传递下去，双栏 overflow-auto 才能正常出滚动条。
            ? 'h-[85vh] w-full max-w-5xl'   // diff 视图用更宽的面板
            : 'max-h-[75vh] w-full max-w-lg',
        )}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          {showingDiff && (
            <button
              type="button"
              onClick={closeDiff}
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
              aria-label="返回文件列表"
            >
              <ArrowLeft className="size-3.5" />
            </button>
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {showingDiff
              ? <><span className="text-[var(--color-muted-foreground)]">待提交文件 · </span>{diffEntry?.path ?? ''}</>
              : `待提交文件 · ${title}`}
          </span>
          {!showingDiff && (
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-foreground)]"
              title="刷新"
            >
              <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1.5 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]"
            aria-label="关闭"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* ── Diff 视图 ─────────────────────────────────────────────────────── */}
        {showingDiff && (
          <div className="min-h-0 flex-1 overflow-hidden">
            {diffLoading && (
              <div className="flex items-center justify-center py-12 text-sm text-[var(--color-muted-foreground)]">
                <RefreshCw className="mr-2 size-4 animate-spin" /> 加载 diff…
              </div>
            )}
            {!diffLoading && diffErr && (
              <div className="px-4 py-3 text-sm text-[var(--color-destructive)]">{diffErr}</div>
            )}
            {!diffLoading && diffData && (
              <SideBySideDiff
                diff={diffData.diff}
                truncated={diffData.truncated}
                className="h-full"
              />
            )}
          </div>
        )}

        {/* ── 文件树视图 ────────────────────────────────────────────────────── */}
        {!showingDiff && (
          <>
            {/* 汇总条 */}
            {stats && stats.total > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b bg-[var(--color-muted)]/30 px-4 py-2 text-[11px] text-[var(--color-muted-foreground)]">
                <span className="font-medium text-[var(--color-foreground)]">{stats.total} 个文件</span>
                {stats.modified > 0 && <span className="text-amber-600 dark:text-amber-400">M:{stats.modified}</span>}
                {stats.added > 0 && <span className="text-emerald-600 dark:text-emerald-400">A:{stats.added}</span>}
                {stats.deleted > 0 && <span className="text-rose-600 dark:text-rose-400">D:{stats.deleted}</span>}
                {stats.renamed > 0 && <span className="text-violet-600 dark:text-violet-400">R:{stats.renamed}</span>}
                {stats.untracked > 0 && <span className="text-[var(--color-muted-foreground)]">?:{stats.untracked}</span>}
              </div>
            )}
            {/* 内容区 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loading && (
                <div className="flex items-center justify-center py-12 text-sm text-[var(--color-muted-foreground)]">
                  <RefreshCw className="mr-2 size-4 animate-spin" /> 加载中…
                </div>
              )}
              {!loading && err && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  {err}
                </div>
              )}
              {!loading && !err && data && data.entries.length === 0 && (
                <div className="py-12 text-center text-sm text-[var(--color-muted-foreground)]">
                  ✓ 工作区干净，没有未提交的改动
                </div>
              )}
              {!loading && !err && tree.length > 0 && (
                <div>
                  {tree.map(node => (
                    <TreeRow key={node.path} node={node} depth={0} collapsed={collapsed} onToggle={toggle} onPickFile={openDiff} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
