import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  ChevronsDown,
  ChevronsUp,
  Check,
  Copy,
  Download,
  Loader2,
  Minimize2,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Segmented } from '@/components/ui/segmented'
import { cn } from '@/lib/utils'
import { JsonEditor, type JsonEditorRef } from './JsonEditor'
import { JsonTreeView } from './JsonTreeView'
import { useJsonWorker } from '../lib/useJsonWorker'
import type { WorkerReq } from '../lib/json-worker'
import { buildFlow, collectAllPaths, COLLECT_ALL_MAX } from '../lib/jsonToFlow'
import type { IndexEntry } from '../lib/json-worker'
import {
  ancestorPathsOf,
  parentPathOf,
  searchInJson,
  SEARCH_MAX_RESULTS,
  type SearchMatch,
  type SearchMode,
} from '../lib/searchInJson'

const INDENT_OPTIONS = [
  { value: '2', label: '2 空格' },
  { value: '4', label: '4 空格' },
  { value: 'tab', label: 'Tab' },
] as const
type IndentValue = (typeof INDENT_OPTIONS)[number]['value']

const VIEW_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'tree', label: '图形' },
] as const
type ViewMode = (typeof VIEW_OPTIONS)[number]['value']

const HIGHLIGHT_MAX_BYTES = 1 * 1024 * 1024
const COPY_MAX_BYTES = 8 * 1024 * 1024
const SOFT_WARN_BYTES = 32 * 1024 * 1024
/** 图形视图安全阈值：超过此大小不自动转图，提示用户继续看文本。
 *  懒展开 + worker parse 之后 50 MB 可承受（worker parse ~500 ms 异步，主线程结构化克隆 deserialize ~150-200 ms）。 */
const TREE_SAFE_MAX_BYTES = 50 * 1024 * 1024
const EDITOR_HEIGHT = 'calc(100vh - 320px)'
const EDITOR_MIN_HEIGHT = '320px'

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

type TreeStatus =
  | { kind: 'empty' }
  | { kind: 'too_big'; bytes: number }
  | { kind: 'parse_fail'; error: string }
  | { kind: 'parsing'; bytes: number }
  | { kind: 'ready' }

export function JsonPanel() {
  const [indent, setIndent] = useState<IndentValue>('2')
  const [viewMode, setViewMode] = useState<ViewMode>('text')
  const [error, setError] = useState<string | null>(null)
  const [inputBytes, setInputBytes] = useState(0)
  const [outputBytes, setOutputBytes] = useState(0)
  const [copied, setCopied] = useState(false)
  const [treeStatus, setTreeStatus] = useState<TreeStatus>({ kind: 'empty' })
  /** 解析好的 JSON root；从输出快照来。在 ready 时有值。 */
  const [parsedRoot, setParsedRoot] = useState<unknown>(undefined)
  /** 当前展开成独立节点的 id 集合；'root' 永远在内。 */
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']))
  /** path → 输出文本位置的索引，由 worker 的 format(withIndex:true) 返回；
   *  仅最近一次格式化操作有效，重新点格式化会刷新。 */
  const [pathIndex, setPathIndex] = useState<Map<string, IndexEntry> | null>(null)
  // ---- 搜索（v8） ----
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<SearchMode>('both')
  const [matches, setMatches] = useState<SearchMatch[]>([])
  const [currentMatchIdx, setCurrentMatchIdx] = useState(-1)
  /** 居中目标：用 version 计数避免「相同 nodeId 第二次触发」时 useEffect 不跑。 */
  const [centerOn, setCenterOn] = useState<{ nodeId: string; version: number } | null>(null)
  const inputRef = useRef<JsonEditorRef>(null)
  const outputRef = useRef<JsonEditorRef>(null)
  const { run, busy } = useJsonWorker()
  /** 自增票号：每次 refreshFromOutput 自增，async parse 回来时只有最新票号才生效，老结果丢弃。 */
  const refreshTicketRef = useRef(0)

  const indentVal: number | '\t' = indent === 'tab' ? '\t' : Number.parseInt(indent, 10)

  /** 从输出取文本，决定 tree 状态。
   *  parse 走 worker 异步：50 MB 时 parse ~500 ms 不卡主线程；结构化克隆回主线程那 ~150 ms 仍同步，但只一次。
   *  并发保护：每次调用拿一个递增 ticket，结果回来时若 ticket 已过期就丢弃（用户切走 / 又点了格式化）。 */
  const refreshFromOutput = useCallback(async () => {
    const ticket = ++refreshTicketRef.current
    const v = outputRef.current?.getValue() ?? ''
    if (!v.trim()) {
      setTreeStatus({ kind: 'empty' })
      setParsedRoot(undefined)
      return
    }
    const bytes = new Blob([v]).size
    if (bytes > TREE_SAFE_MAX_BYTES) {
      setTreeStatus({ kind: 'too_big', bytes })
      setParsedRoot(undefined)
      return
    }
    setTreeStatus({ kind: 'parsing', bytes })
    const res = await run({ op: 'parse', input: v })
    if (ticket !== refreshTicketRef.current) return // 过期，丢
    if (!res.ok) {
      setTreeStatus({ kind: 'parse_fail', error: res.error })
      setParsedRoot(undefined)
      return
    }
    setParsedRoot(res.root)
    setExpanded(new Set(['root']))
    setTreeStatus({ kind: 'ready' })
  }, [run])

  useEffect(() => {
    if (viewMode === 'tree') void refreshFromOutput()
  }, [viewMode, refreshFromOutput])

  const flow = useMemo(() => {
    if (treeStatus.kind !== 'ready' || parsedRoot === undefined) return null
    return buildFlow(parsedRoot, { expanded })
  }, [treeStatus.kind, parsedRoot, expanded])

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    if (parsedRoot === undefined) return
    setExpanded(collectAllPaths(parsedRoot))
  }, [parsedRoot])

  const collapseAll = useCallback(() => {
    setExpanded(new Set(['root']))
  }, [])

  const dispatch = useCallback(
    async (op: WorkerReq['op']) => {
      if (busy) return
      setError(null)
      const input = inputRef.current?.getValue() ?? ''
      // 仅 format op 需要带 index（树视图跳转用），其它 op 用不上、白白增大消息体。
      const req =
        op === 'format'
          ? ({ op, input, indent: indentVal, withIndex: true } as Omit<WorkerReq, 'id'>)
          : ({ op, input } as Omit<WorkerReq, 'id'>)
      const res = await run(req)
      if (res.ok) {
        outputRef.current?.setValue(res.output ?? '')
        // 把 IndexEntry[] 转成 Map<path, entry>，跳转时 O(1) 查找
        if (op === 'format' && res.index) {
          const m = new Map<string, IndexEntry>()
          for (const e of res.index) m.set(e.path, e)
          setPathIndex(m)
        } else {
          setPathIndex(null)
        }
        if (viewMode === 'tree') queueMicrotask(() => { void refreshFromOutput() })
      } else {
        outputRef.current?.setValue('')
        setOutputBytes(0)
        setPathIndex(null)
        setError(res.error)
        if (typeof res.errorPos === 'number') inputRef.current?.focusError(res.errorPos)
        if (viewMode === 'tree') setTreeStatus({ kind: 'parse_fail', error: res.error })
      }
    },
    [busy, indentVal, refreshFromOutput, run, viewMode],
  )

  /** 跳到第 idx 条匹配：自动沿 PATH_SEP 把祖先链全部加入 expanded，并把父节点居中。
   *  list 默认取最新的 matches state；外部调用方可传刚算好的列表避免首次跳到旧值。 */
  const jumpToMatch = useCallback(
    (idx: number, list: SearchMatch[] = matches) => {
      const m = list[idx]
      if (!m) return
      setCurrentMatchIdx(idx)
      const ancestors = ancestorPathsOf(m.path)
      setExpanded(prev => {
        const next = new Set(prev)
        for (const p of ancestors) next.add(p)
        return next
      })
      // 父节点（包含该 row 的节点）作为居中目标；version++ 保证 useEffect 必触发
      const parent = parentPathOf(m.path)
      setCenterOn(prev => ({ nodeId: parent, version: (prev?.version ?? 0) + 1 }))
    },
    [matches],
  )

  // debounce 搜索：parsedRoot 或 query 变化 250 ms 后跑一次
  useEffect(() => {
    if (!parsedRoot || !searchQuery.trim()) {
      setMatches([])
      setCurrentMatchIdx(-1)
      return
    }
    const tid = window.setTimeout(() => {
      const r = searchInJson(parsedRoot, searchQuery.trim(), searchMode)
      setMatches(r)
      if (r.length > 0) jumpToMatch(0, r)
      else setCurrentMatchIdx(-1)
    }, 250)
    return () => window.clearTimeout(tid)
    // 注意：jumpToMatch 闭包了 matches，但这里调用时显式传入 r，不依赖 matches state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedRoot, searchQuery, searchMode])

  const gotoNextMatch = useCallback(() => {
    if (matches.length === 0) return
    const next = (currentMatchIdx + 1) % matches.length
    jumpToMatch(next)
  }, [matches.length, currentMatchIdx, jumpToMatch])

  const gotoPrevMatch = useCallback(() => {
    if (matches.length === 0) return
    const prev = (currentMatchIdx - 1 + matches.length) % matches.length
    jumpToMatch(prev)
  }, [matches.length, currentMatchIdx, jumpToMatch])

  /** 派生：所有命中的 row 全路径集合，供 JsonNode 软高亮。 */
  const matchedPathSet = useMemo(() => new Set(matches.map(m => m.path)), [matches])
  const currentMatchPath = currentMatchIdx >= 0 ? matches[currentMatchIdx]?.path : undefined

  /** 树视图点击行 key 时回调：自动切回文本视图 + 在编辑器里选中该 key/value 区间。 */
  const handleJump = useCallback(
    (path: string) => {
      const entry = pathIndex?.get(path)
      if (!entry) return
      const from = entry.keyStart >= 0 ? entry.keyStart : entry.valueStart
      const to = entry.valueEnd
      setViewMode('text')
      // viewMode 切到 text 后编辑器才显示；用 microtask 等 React 渲染完再 focus
      queueMicrotask(() => outputRef.current?.focusAt(from, to))
    },
    [pathIndex],
  )

  const onCopy = useCallback(async () => {
    const v = outputRef.current?.getValue() ?? ''
    if (!v || outputBytes > COPY_MAX_BYTES) return
    try {
      await navigator.clipboard.writeText(v)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* 静默失败 */
    }
  }, [outputBytes])

  const onDownload = useCallback(() => {
    const v = outputRef.current?.getValue() ?? ''
    if (!v) return
    const blob = new Blob([v], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `formatted-${Date.now()}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [])

  const inputHighlight = inputBytes <= HIGHLIGHT_MAX_BYTES
  const outputHighlight = outputBytes <= HIGHLIGHT_MAX_BYTES
  const canCopy = outputBytes > 0 && outputBytes <= COPY_MAX_BYTES
  const canDownload = outputBytes > 0

  return (
    <div className="space-y-3">
      {/* 顶部控制条 */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--color-muted-foreground)]">缩进</label>
          <Segmented value={indent} onChange={setIndent} options={INDENT_OPTIONS} />
        </div>
        <div className="flex flex-wrap gap-2 self-end">
          <Button onClick={() => dispatch('format')} size="sm" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} 格式化
          </Button>
          <Button onClick={() => dispatch('minify')} size="sm" variant="secondary" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Minimize2 />} 压缩
          </Button>
          <Button onClick={() => dispatch('escape')} size="sm" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUpFromLine />} 转义
          </Button>
          <Button onClick={() => dispatch('unescape')} size="sm" variant="outline" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />} 反转义
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 输入 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输入</label>
            <span
              className={cn(
                'text-[11px] tabular-nums text-[var(--color-muted-foreground)]',
                inputBytes > SOFT_WARN_BYTES && 'text-[var(--color-destructive)]',
              )}
            >
              {formatBytes(inputBytes)}
              {!inputHighlight && inputBytes > 0 && '（已关高亮）'}
            </span>
          </div>
          <div style={{ height: EDITOR_HEIGHT, minHeight: EDITOR_MIN_HEIGHT }}>
            <JsonEditor
              ref={inputRef}
              placeholder='{"name":"toolbox","items":[1,2,3]}'
              minHeight="100%"
              maxHeight="100%"
              highlight={inputHighlight}
              onBytesChange={setInputBytes}
            />
          </div>
        </div>

        {/* 输出 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--color-muted-foreground)]">输出</label>
              {outputBytes > 0 && (
                <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                  {formatBytes(outputBytes)}
                  {viewMode === 'text' && !outputHighlight && '（已关高亮）'}
                </span>
              )}
              {viewMode === 'tree' && treeStatus.kind === 'ready' && (
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  已展开 {expanded.size} 节点
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {viewMode === 'tree' && treeStatus.kind === 'ready' && (
                <>
                  <button
                    type="button"
                    onClick={expandAll}
                    title={`全部展开（上限 ${COLLECT_ALL_MAX}）`}
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
                  >
                    <ChevronsDown className="size-3" /> 全展开
                  </button>
                  <button
                    type="button"
                    onClick={collapseAll}
                    title="只保留 root"
                    className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]"
                  >
                    <ChevronsUp className="size-3" /> 全收起
                  </button>
                </>
              )}
              <Segmented value={viewMode} onChange={setViewMode} options={VIEW_OPTIONS} />
              <button
                type="button"
                onClick={onCopy}
                disabled={!canCopy}
                title={
                  outputBytes > COPY_MAX_BYTES
                    ? `结果超过 ${COPY_MAX_BYTES / 1024 / 1024} MB，请用下载`
                    : '复制到剪贴板'
                }
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                  canCopy
                    ? 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
                    : 'cursor-not-allowed opacity-50',
                )}
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? '已复制' : '复制'}
              </button>
              <button
                type="button"
                onClick={onDownload}
                disabled={!canDownload}
                title="下载为 .json 文件"
                className={cn(
                  'inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors',
                  canDownload
                    ? 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)]'
                    : 'cursor-not-allowed opacity-50',
                )}
              >
                <Download className="size-3" /> 下载
              </button>
            </div>
          </div>
          {/* 树视图专属搜索栏 */}
          {viewMode === 'tree' && treeStatus.kind === 'ready' && (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (e.shiftKey) gotoPrevMatch()
                      else gotoNextMatch()
                    } else if (e.key === 'Escape') {
                      setSearchQuery('')
                    }
                  }}
                  placeholder="搜 key / value... (Enter 下一个，Shift+Enter 上一个)"
                  className="w-full rounded-md border bg-[var(--color-background)] py-1 pl-7 pr-7 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    title="清空"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
              <Segmented
                value={searchMode}
                onChange={setSearchMode}
                options={[
                  { value: 'both', label: 'key+value' },
                  { value: 'key', label: 'key' },
                  { value: 'value', label: 'value' },
                ] as const}
              />
              {searchQuery && (
                <div className="flex items-center gap-1">
                  <span className="text-[11px] tabular-nums text-[var(--color-muted-foreground)]">
                    {matches.length === 0
                      ? '0 匹配'
                      : `${currentMatchIdx + 1}/${matches.length}${matches.length >= SEARCH_MAX_RESULTS ? '+' : ''}`}
                  </span>
                  <button
                    type="button"
                    onClick={gotoPrevMatch}
                    disabled={matches.length === 0}
                    title="上一个 (Shift+Enter)"
                    className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)] disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={gotoNextMatch}
                    disabled={matches.length === 0}
                    title="下一个 (Enter)"
                    className="rounded p-1 text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-foreground)] disabled:opacity-40"
                  >
                    <ChevronRight className="size-3" />
                  </button>
                </div>
              )}
            </div>
          )}
          <div style={{ height: EDITOR_HEIGHT, minHeight: EDITOR_MIN_HEIGHT }}>
            <div className={viewMode === 'text' ? 'h-full' : 'hidden'}>
              <JsonEditor
                ref={outputRef}
                readOnly
                minHeight="100%"
                maxHeight="100%"
                highlight={outputHighlight}
                onBytesChange={setOutputBytes}
              />
            </div>
            {viewMode === 'tree' && (
              <TreePane
                status={treeStatus}
                flow={flow}
                expanded={expanded}
                onToggle={toggleExpand}
                onJump={pathIndex ? handleJump : undefined}
                matchedPaths={matchedPathSet}
                currentMatchPath={currentMatchPath}
                centerOn={centerOn}
              />
            )}
          </div>
          {error && <p className="text-xs text-[var(--color-destructive)]">{error}</p>}
        </div>
      </div>
    </div>
  )
}

interface TreePaneProps {
  status: TreeStatus
  flow: ReturnType<typeof buildFlow> | null
  expanded: ReadonlySet<string>
  onToggle: (id: string) => void
  onJump?: (path: string) => void
  matchedPaths?: ReadonlySet<string>
  currentMatchPath?: string
  centerOn?: { nodeId: string; version: number } | null
}

function TreePane({ status, flow, expanded, onToggle, onJump, matchedPaths, currentMatchPath, centerOn }: TreePaneProps) {
  if (status.kind === 'empty') {
    return (
      <div className="flex h-full items-center justify-center rounded-md border bg-[var(--color-muted)] text-xs text-[var(--color-muted-foreground)]">
        点「格式化」或在输入区粘贴 JSON 后，这里会绘制节点图
      </div>
    )
  }
  if (status.kind === 'too_big') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 rounded-md border bg-[var(--color-muted)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
        <span>当前输出 {(status.bytes / 1024 / 1024).toFixed(2)} MB，超过图形视图安全阈值 {TREE_SAFE_MAX_BYTES / 1024 / 1024} MB</span>
        <span>已避免强制绘制造成卡顿，请切回「文本」视图</span>
      </div>
    )
  }
  if (status.kind === 'parsing') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-md border bg-[var(--color-muted)] p-4 text-center text-xs text-[var(--color-muted-foreground)]">
        <Loader2 className="size-4 animate-spin" />
        <span>解析 {(status.bytes / 1024 / 1024).toFixed(2)} MB JSON（Worker 异步）…</span>
      </div>
    )
  }
  if (status.kind === 'parse_fail') {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-[var(--color-destructive)] bg-[var(--color-destructive)]/5 p-4 text-center text-xs text-[var(--color-destructive)]">
        无法解析为 JSON：{status.error}
      </div>
    )
  }
  if (!flow) return null
  return (
    <div className="relative h-full">
      <JsonTreeView
        result={flow}
        expanded={expanded}
        onToggle={onToggle}
        onJump={onJump}
        matchedPaths={matchedPaths}
        currentMatchPath={currentMatchPath}
        centerOn={centerOn}
      />
      {flow.overflow && (
        <div className="absolute right-2 top-2 rounded bg-amber-500/90 px-2 py-1 text-[11px] text-white shadow">
          节点已截断（超过 {flow.nodeCount}）
        </div>
      )}
    </div>
  )
}
