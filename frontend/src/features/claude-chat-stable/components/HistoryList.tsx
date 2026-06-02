import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'
import { listHistory } from '../api'

interface Props {
  /** 默认扫描的 cwd（取当前会话 cwd 或上次新建用的 cwd） */
  defaultCwd: string
  onPick: (sdkSessionId: string, cwd: string) => void
}

/** 本机历史会话（复刻插件「历史会话」选择器）：按 cwd 扫 ~/.claude/projects。 */
export function HistoryList({ defaultCwd, onPick }: Props) {
  const [cwd, setCwd] = useState(defaultCwd)
  const [query, setQuery] = useState(cwd)
  const [filter, setFilter] = useState('')

  const { data = [], isFetching } = useQuery({
    queryKey: ['claude-chat-history', query],
    queryFn: () => listHistory(query),
  })

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
            <li key={s.sdkSessionId}>
              <button
                type="button"
                className="block w-full px-3 py-3 text-left hover:bg-[var(--color-accent)]"
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
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
