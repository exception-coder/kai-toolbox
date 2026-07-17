import { useMemo } from 'react'
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

function Cell({ cell }: { cell: HalfCell | undefined }) {
  if (!cell) return <td className="w-1/2 bg-[var(--color-muted)]/30" />
  return (
    <td className={cn('w-1/2 whitespace-pre', CELL_BG[cell.kind])}>
      <div className="flex min-w-0 items-start gap-0">
        {/* 行号 */}
        <span className={cn(
          'w-10 shrink-0 select-none px-1.5 py-0.5 text-right font-mono text-[10px] tabular-nums',
          LINENO_COLOR[cell.kind],
        )}>
          {cell.kind !== 'empty' ? cell.lineNo : ''}
        </span>
        {/* 符号列（+/-/空格） */}
        <span className={cn(
          'w-4 shrink-0 select-none py-0.5 text-center font-mono text-[10px]',
          cell.kind === 'removed' ? 'text-rose-500' :
          cell.kind === 'added'   ? 'text-emerald-500' : 'text-transparent',
        )}>
          {cell.kind === 'removed' ? '-' : cell.kind === 'added' ? '+' : ' '}
        </span>
        {/* 内容 */}
        <span className={cn(
          'flex-1 overflow-hidden py-0.5 font-mono text-[11px] leading-5',
          CONTENT_COLOR[cell.kind],
        )}>
          {cell.kind !== 'empty' ? cell.content : ''}
        </span>
      </div>
    </td>
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
 * - hunk 分隔行（@@ ... @@）横跨两栏
 */
export function SideBySideDiff({ diff, truncated, className }: Props) {
  const rows = useMemo(() => parseSideBySide(diff), [diff])

  if (!diff.trim()) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-sm text-[var(--color-muted-foreground)]', className)}>
        无可展示的差异（文件可能是新增未追踪或二进制文件）
      </div>
    )
  }

  return (
    <div className={cn('overflow-auto text-[11px]', className)}>
      {truncated && (
        <div className="border-b border-amber-300 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          diff 内容过大，已截断显示
        </div>
      )}
      {/* 列头 */}
      <div className="sticky top-0 z-10 flex border-b bg-[var(--color-muted)]/80 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)] backdrop-blur-sm">
        <div className="w-1/2 border-r px-3 py-1.5">旧版本</div>
        <div className="w-1/2 px-3 py-1.5">新版本</div>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {rows.map(row => {
            if (row.type === 'hunk') {
              return (
                <tr key={row.id} className="bg-cyan-500/8 dark:bg-cyan-500/10">
                  <td colSpan={2} className="py-0.5 pl-3 font-mono text-[10px] text-cyan-700 dark:text-cyan-400">
                    {row.hunk}
                  </td>
                </tr>
              )
            }
            return (
              <tr key={row.id} className="border-b border-[var(--color-border)]/30">
                <Cell cell={row.left} />
                {/* 竖分隔线 */}
                <td className="w-px border-r border-[var(--color-border)]" />
                <Cell cell={row.right} />
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
