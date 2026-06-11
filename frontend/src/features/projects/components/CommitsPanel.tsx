import { useEffect, useState } from 'react'
import { ArrowLeft, GitCommit, X } from 'lucide-react'
import { getCommitDiff, listCommits } from '../api'
import type { CommitDiff, CommitInfo, ProjectInfo } from '../types'

interface Props {
  project: ProjectInfo
  onClose: () => void
}

/** 项目提交记录弹层：列最近提交，点某条看其 diff。覆盖在卡片上，stopPropagation 防触发卡片导航。 */
export function CommitsPanel({ project, onClose }: Props) {
  const [commits, setCommits] = useState<CommitInfo[] | null>(null)
  const [listErr, setListErr] = useState<string | null>(null)
  const [diff, setDiff] = useState<CommitDiff | null>(null)
  const [diffErr, setDiffErr] = useState<string | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  useEffect(() => {
    let alive = true
    listCommits(project.path, 50)
      .then(r => { if (alive) setCommits(r.commits) })
      .catch(e => { if (alive) setListErr(e instanceof Error ? e.message : String(e)) })
    return () => { alive = false }
  }, [project.path])

  const openDiff = (hash: string) => {
    setDiff(null)
    setDiffErr(null)
    setDiffLoading(true)
    getCommitDiff(project.path, hash)
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
          <span className="truncate text-sm font-semibold">{project.name}</span>
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
                <DiffView text={diff.diff} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** unified diff 按行首字符着色。 */
function DiffView({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <pre className="flex-1 overflow-auto bg-[var(--color-muted)]/30 p-3 text-[11px] leading-relaxed">
      {lines.map((line, i) => (
        <div key={i} className={lineClass(line)}>{line || ' '}</div>
      ))}
    </pre>
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
