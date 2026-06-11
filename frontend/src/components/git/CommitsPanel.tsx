import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronRight, GitCommit, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CommitDiff, CommitInfo } from './types'

interface Props {
  /** 弹层标题（如项目名 / 会话目录名） */
  title: string
  /** 拉取提交列表 */
  fetchCommits: () => Promise<CommitInfo[]>
  /** 拉取某提交 diff */
  fetchDiff: (hash: string) => Promise<CommitDiff>
  onClose: () => void
}

/**
 * 通用 git 提交记录弹层：列最近提交，点某条看其 diff。数据源由 fetchCommits/fetchDiff 注入，
 * 与具体后端接口解耦，供 projects（按 path）/ claude-chat（按 sessionId）等复用。
 */
export function CommitsPanel({ title, fetchCommits, fetchDiff, onClose }: Props) {
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [listErr, setListErr] = useState<string | null>(null)
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [diffErr, setDiffErr] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    let alive = true
    fetchCommits()
      .then(c => { if (alive) setCommits(c) })
      .catch(e => { if (alive) setListErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
    // fetchCommits 由调用方按需 memo；此处仅首次加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const openDiff = (hash: string) => {
    setDiff(null)
    setDiffErr(null)
    setDiffLoading(true)
    fetchDiff(hash)
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

/** 按文件折叠展示 diff：列出改动文件（带 +/- 计数），点击展开该文件的着色 diff。 */
function DiffView({ text }: { text: string }) {
  const files = useMemo(() => parseFiles(text), [text])
  // 默认展开第一个文件；其余折叠，避免一屏堆成一长条
  const [open, setOpen] = useState<Set<number>>(() => new Set(files.length > 0 ? [0] : []))

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

  const toggle = (i: number) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-3 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">{files.length} 个文件改动</div>
      {files.map((f, i) => (
        <div key={i} className="border-t">
          <button
            type="button"
            onClick={() => toggle(i)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-muted)]"
          >
            <ChevronRight className={cn('size-3.5 shrink-0 transition-transform', open.has(i) && 'rotate-90')} />
            <span className="truncate font-mono text-xs">{f.path}</span>
            <span className="ml-auto shrink-0 space-x-1 text-[11px] font-mono">
              {f.additions > 0 && <span className="text-emerald-700 dark:text-emerald-400">+{f.additions}</span>}
              {f.deletions > 0 && <span className="text-red-700 dark:text-red-400">-{f.deletions}</span>}
            </span>
          </button>
          {open.has(i) && (
            <pre className="overflow-auto bg-[var(--color-muted)]/30 px-3 py-2 text-[11px] leading-relaxed">
              {f.body.split('\n').map((line, j) => (
                <div key={j} className={lineClass(line)}>{line || ' '}</div>
              ))}
            </pre>
          )}
        </div>
      ))}
    </div>
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
