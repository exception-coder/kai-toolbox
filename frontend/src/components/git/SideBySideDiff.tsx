import { useCallback, useMemo, useRef } from 'react'
import { cn } from '@/lib/utils'

// ── 数据结构 ──────────────────────────────────────────────────────────────────

type HalfCell =
  | { kind: 'context' | 'removed' | 'added'; lineNo: number; content: string }
  | { kind: 'empty' }

interface DiffRow {
  id: string
  type: 'hunk' | 'line'
  hunk?: string
  left?: HalfCell
  right?: HalfCell
}

// ── 解析 ──────────────────────────────────────────────────────────────────────

/**
 * 将 unified diff 解析成侧边对比行。
 * 算法：同一 hunk 内连续的 - 和 + 行按顺序两两配对；多余的行对面留空。
 */
export function parseSideBySide(raw: string): DiffRow[] {
  if (!raw.trim()) return []
  const lines = raw.split('\n')
  const rows: DiffRow[] = []
  let oldLine = 0
  let newLine = 0
  let seq = 0

  // 暂存待配对的 removed/added 组
  let removedBuf: string[] = []
  let addedBuf: string[] = []

  const flushBuf = () => {
    const maxLen = Math.max(removedBuf.length, addedBuf.length)
    for (let i = 0; i < maxLen; i++) {
      const left: HalfCell = removedBuf[i] !== undefined
        ? { kind: 'removed', lineNo: oldLine++, content: removedBuf[i] }
        : { kind: 'empty' }
      const right: HalfCell = addedBuf[i] !== undefined
        ? { kind: 'added', lineNo: newLine++, content: addedBuf[i] }
        : { kind: 'empty' }
      rows.push({ id: `r${seq++}`, type: 'line', left, right })
    }
    removedBuf = []
    addedBuf = []
  }

  for (const line of lines) {
    // 元信息行：跳过（不展示）
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) continue

    if (line.startsWith('@@')) {
      flushBuf()
      const m = line.match(/@@ -(\d+)(?:,\d*)? \+(\d+)(?:,\d*)? @@/)
      if (m) { oldLine = parseInt(m[1]); newLine = parseInt(m[2]) }
      rows.push({ id: `r${seq++}`, type: 'hunk', hunk: line })
    } else if (line.startsWith('-')) {
      removedBuf.push(line.slice(1))
    } else if (line.startsWith('+')) {
      addedBuf.push(line.slice(1))
    } else if (line.startsWith(' ') || line === '') {
      // 上下文行
      flushBuf()
      const content = line.startsWith(' ') ? line.slice(1) : ''
      rows.push({
        id: `r${seq++}`,
        type: 'line',
        left:  { kind: 'context', lineNo: oldLine++, content },
        right: { kind: 'context', lineNo: newLine++, content },
      })
    }
  }
  flushBuf()
  return rows
}

// ── 渲染辅助 ─────────────────────────────────────────────────────────────────

const CELL_BG: Record<HalfCell['kind'], string> = {
  removed: 'bg-rose-500/10 dark:bg-rose-500/15',
  added:   'bg-emerald-500/10 dark:bg-emerald-500/15',
  context: '',
  empty:   'bg-[var(--color-muted)]/30',
}

const LINENO_COLOR: Record<HalfCell['kind'], string> = {
  removed: 'text-rose-500/60',
  added:   'text-emerald-500/60',
  context: 'text-[var(--color-muted-foreground)]/50',
  empty:   'text-[var(--color-muted-foreground)]/20',
}

const CONTENT_COLOR: Record<HalfCell['kind'], string> = {
  removed: 'text-rose-800 dark:text-rose-300',
  added:   'text-emerald-800 dark:text-emerald-300',
  context: 'text-[var(--color-foreground)]',
  empty:   '',
}

/**
 * 单个半行（一侧的一行）。
 * 关键点：整行 whitespace-pre + shrink-0（不换行、不收缩），让内容按真实宽度撑开父容器，
 * 由外层 pane 的 overflow-x-auto 负责横向滚动——而不是像旧版那样用 overflow-hidden 裁掉看不见的部分。
 */
function PaneLine({ cell }: { cell: HalfCell | undefined }) {
  if (!cell) return <div className="h-[22px] bg-[var(--color-muted)]/30" />
  return (
    <div className={cn('flex h-[22px] w-max min-w-full items-center whitespace-pre', CELL_BG[cell.kind])}>
      {/* 行号 */}
      <span className={cn(
        'w-10 shrink-0 select-none px-1.5 text-right font-mono text-[10px] tabular-nums',
        LINENO_COLOR[cell.kind],
      )}>
        {cell.kind !== 'empty' ? cell.lineNo : ''}
      </span>
      {/* 符号列（+/-/空格） */}
      <span className={cn(
        'w-4 shrink-0 select-none text-center font-mono text-[10px]',
        cell.kind === 'removed' ? 'text-rose-500' :
        cell.kind === 'added'   ? 'text-emerald-500' : 'text-transparent',
      )}>
        {cell.kind === 'removed' ? '-' : cell.kind === 'added' ? '+' : ' '}
      </span>
      {/* 内容：不换行、不裁剪，宽度随文本自然撑开 */}
      <span className={cn('shrink-0 pr-4 font-mono text-[11px] leading-[22px]', CONTENT_COLOR[cell.kind])}>
        {cell.kind !== 'empty' ? cell.content : ''}
      </span>
    </div>
  )
}

function HunkRow({ text }: { text: string }) {
  return (
    <div className="h-[22px] whitespace-nowrap bg-cyan-500/10 pl-3 font-mono text-[10px] leading-[22px] text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400">
      {text}
    </div>
  )
}

// ── 主组件 ────────────────────────────────────────────────────────────────────

interface Props {
  /** unified diff 原始文本（git diff 输出） */
  diff: string
  /** 是否被截断 */
  truncated?: boolean
  className?: string
}

/**
 * 双栏侧边 diff 对比视图，参考 IntelliJ IDEA 的 diff 模式：
 * - 左栏：旧文件（删除行红底，上下文灰色）
 * - 右栏：新文件（新增行绿底，上下文灰色）
 * - hunk 分隔行（@@ ... @@）在两栏各自渲染一份，保持同一行高对齐
 *
 * 布局关键：左右两栏是两个独立的横向可滚动容器（各自 overflow-x-auto，且各有
 * 固定高度 h-full，滚动条常驻可见、不用滚到文件末尾才能看到）；纵向滚动通过
 * onScroll 互相镜像 scrollTop 保持同步，行号/行高两栏完全一致，故不会错位。
 */
export function SideBySideDiff({ diff, truncated, className }: Props) {
  const rows = useMemo(() => parseSideBySide(diff), [diff])

  const leftRef = useRef<HTMLDivElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  // 防止两侧 onScroll 互相触发造成死循环：记录本次滚动是谁发起的
  const syncingFrom = useRef<'left' | 'right' | null>(null)

  const onScrollLeft = useCallback(() => {
    if (syncingFrom.current === 'right') { syncingFrom.current = null; return }
    const r = rightRef.current
    if (!r || !leftRef.current) return
    syncingFrom.current = 'left'
    r.scrollTop = leftRef.current.scrollTop
  }, [])
  const onScrollRight = useCallback(() => {
    if (syncingFrom.current === 'left') { syncingFrom.current = null; return }
    const l = leftRef.current
    if (!l || !rightRef.current) return
    syncingFrom.current = 'right'
    l.scrollTop = rightRef.current.scrollTop
  }, [])

  if (!diff.trim()) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-sm text-[var(--color-muted-foreground)]', className)}>
        无可展示的差异（文件可能是新增未追踪或二进制文件）
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {truncated && (
        <div className="shrink-0 border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          diff 内容过大，已截断显示
        </div>
      )}
      {/* 列头（不参与横向滚动） */}
      <div className="flex shrink-0 border-b bg-[var(--color-muted)]/80 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">
        <div className="w-1/2 border-r px-3 py-1.5">旧版本</div>
        <div className="w-1/2 px-3 py-1.5">新版本</div>
      </div>
      {/* 双栏内容：各自独立横向滚动条（底部常驻可见），纵向滚动互相同步 */}
      <div className="flex min-h-0 flex-1">
        <div
          ref={leftRef}
          onScroll={onScrollLeft}
          className="min-h-0 w-1/2 min-w-0 overflow-auto border-r border-[var(--color-border)]"
        >
          {rows.map(row => (
            <div key={row.id}>
              {row.type === 'hunk' ? <HunkRow text={row.hunk ?? ''} /> : <PaneLine cell={row.left} />}
            </div>
          ))}
        </div>
        <div
          ref={rightRef}
          onScroll={onScrollRight}
          className="min-h-0 w-1/2 min-w-0 overflow-auto"
        >
          {rows.map(row => (
            <div key={row.id}>
              {row.type === 'hunk' ? <HunkRow text={row.hunk ?? ''} /> : <PaneLine cell={row.right} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
