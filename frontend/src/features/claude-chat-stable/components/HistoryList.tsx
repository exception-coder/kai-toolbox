import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, History, Pencil, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { deleteHistory, listHistory, renameHistory } from '../api'

interface Props {
  /** 默认扫描的 cwd（取当前会话 cwd 或上次新建用的 cwd） */
  defaultCwd: string
  onPick: (sdkSessionId: string, cwd: string) => void
}

/** 本机历史会话（复刻插件「历史会话」选择器）：扫 ~/.claude/projects，可重命名（别名）/ 删除（移回收）。 */
export function HistoryList({ defaultCwd, onPick }: Props) {
  const qc = useQueryClient()
  const [cwd, setCwd] = useState(defaultCwd)
  const [query, setQuery] = useState(cwd)
  const [filter, setFilter] = useState('')
  const [editingSid, setEditingSid] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const { data = [], isFetching } = useQuery({
    queryKey: ['claude-chat-history', query],
    queryFn: () => listHistory(query),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: ['claude-chat-history'] })

  const startEdit = (sid: string, cur: string) => {
    setEditingSid(sid)
    setDraft(cur)
  }
  const commitEdit = async (sid: string) => {
    const t = draft.trim()
    setEditingSid(null)
    await renameHistory(sid, t)
    refresh()
  }
  const remove = async (sid: string, c: string) => {
    await deleteHistory(sid, c)
    refresh()
  }

  const shown = filter.trim()
    ? data.filter(s => s.title.toLowerCase().includes(filter.trim().toLowerCase()))
    : data

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          className="flex-1 rounded-md border bg-[var(--color-background)] px-3 py-2 text-sm"
          placeholder="工作目录 cwd（留空=最近全部）"
          value={cwd}
          onChange={e => setCwd(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={() => setQuery(cwd)}>
          <History className="size-4" /> 扫描
        </Button>
      </div>
      <div className="flex items-center gap-2 px-3 pb-2">
        <Search className="size-4 text-[var(--color-muted-foreground)]" />
        <input
          className="flex-1 bg-transparent text-sm outline-none"
          placeholder="搜索标题…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <span className="text-xs text-[var(--color-muted-foreground)]">
          {isFetching ? '扫描中…' : `${shown.length} 条`}
        </span>
      </div>
      {shown.length === 0 ? (
        <div className="px-3 py-4 text-sm text-[var(--color-muted-foreground)]">
          {isFetching ? '' : '该目录下没有历史会话'}
        </div>
      ) : (
        <ul className="divide-y">
          {shown.map(s => (
            <li key={s.sdkSessionId} className="flex items-center gap-2 px-3 py-3">
              {editingSid === s.sdkSessionId ? (
                <input
                  autoFocus
                  className="min-w-0 flex-1 rounded-md border bg-[var(--color-background)] px-2 py-1 text-sm"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); void commitEdit(s.sdkSessionId) }
                    else if (e.key === 'Escape') setEditingSid(null)
                  }}
                  onBlur={() => void commitEdit(s.sdkSessionId)}
                />
              ) : (
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onPick(s.sdkSessionId, s.cwd ?? cwd)}
                >
                  <div className="truncate text-sm font-medium">{s.title}</div>
                  {s.cwd && (
                    <div className="truncate text-xs text-[var(--color-foreground)]/70" title={s.cwd}>{s.cwd}</div>
                  )}
                  <div className="truncate text-xs text-[var(--color-muted-foreground)]">
                    {formatDate(s.lastModified)} · {s.messageCount} 条
                  </div>
                </button>
              )}
              {editingSid === s.sdkSessionId ? (
                <button
                  type="button"
                  className="rounded-md p-2 text-[var(--color-primary)]"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => void commitEdit(s.sdkSessionId)}
                  aria-label="确认重命名"
                >
                  <Check className="size-4" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                    onClick={e => { e.stopPropagation(); startEdit(s.sdkSessionId, s.title) }}
                    aria-label="重命名"
                  >
                    <Pencil className="size-4" />
                  </button>
                  <button
                    type="button"
                    className="rounded-md p-2 text-[var(--color-muted-foreground)] hover:text-[var(--color-destructive)]"
                    onClick={e => { e.stopPropagation(); void remove(s.sdkSessionId, s.cwd ?? cwd) }}
                    aria-label="删除"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
