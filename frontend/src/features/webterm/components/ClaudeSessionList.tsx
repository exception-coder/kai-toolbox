import { useMemo, useState } from 'react'
import { Play, Power, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { useClaudeSessions, useDeleteClaudeSession } from '../hooks/useClaudeSessions'
import type { ClaudeSessionView } from '../api'

interface ClaudeSessionListProps {
  onLaunch: (s: ClaudeSessionView) => void
}

function shortPath(p: string): string {
  if (!p) return '(默认目录)'
  const norm = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = norm.split('/').filter(Boolean)
  if (parts.length <= 2) return parts.join(' / ')
  return parts.slice(-2).join(' / ')
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(ts).toLocaleDateString()
}

/**
 * 不再自带 Card 外壳——由调用方（抽屉 / 桌面侧栏）提供容器。
 * 内部就是「搜索框 + 列表」两段。
 */
export function ClaudeSessionList({ onLaunch }: ClaudeSessionListProps) {
  const { data, isLoading } = useClaudeSessions()
  const del = useDeleteClaudeSession()
  const confirm = useConfirm()
  const [query, setQuery] = useState('')

  const sessions = data ?? []
  const ranked = useMemo(() => {
    const filtered = query.trim()
      ? sessions.filter(s => {
          const q = query.trim().toLowerCase()
          return (
            (s.title ?? '').toLowerCase().includes(q) ||
            s.cwd.toLowerCase().includes(q) ||
            s.shell.toLowerCase().includes(q)
          )
        })
      : sessions
    return [...filtered].sort((a, b) => {
      const liveDiff = (b.liveSessionId ? 1 : 0) - (a.liveSessionId ? 1 : 0)
      if (liveDiff !== 0) return liveDiff
      return b.lastSeenAt - a.lastSeenAt
    })
  }, [sessions, query])

  const liveCount = sessions.filter(s => !!s.liveSessionId).length

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-[var(--color-muted-foreground)]">载入中…</div>
    )
  }

  const handleDelete = async (s: ClaudeSessionView) => {
    const live = !!s.liveSessionId
    const label = s.title || shortPath(s.cwd)
    const ok = await confirm({
      title: live ? '断开并删除' : '删除记录',
      description: live
        ? `「${label}」当前 PTY 还在运行，断开后 claude 进程会被结束，确认？`
        : `删除「${label}」的记录？`,
      variant: 'destructive',
      confirmText: live ? '断开删除' : '删除',
    })
    if (!ok) return
    del.mutate(s.id)
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="px-1 text-xs text-[var(--color-muted-foreground)]">
        {liveCount} 个运行中 · 共 {sessions.length}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="按路径 / 标题搜索…"
          className="pl-7 text-sm"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        {sessions.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
            还没进过 Claude 会话
          </div>
        )}
        {sessions.length > 0 && ranked.length === 0 && (
          <div className="rounded border border-dashed p-3 text-center text-xs text-[var(--color-muted-foreground)]">
            没有匹配的会话
          </div>
        )}
        <div className="flex flex-col gap-2">
          {ranked.map(s => {
            const isOrphan = s.id.startsWith('live:')
            return (
              <div
                key={s.id}
                className="flex flex-col gap-1 rounded-md border bg-[var(--color-card)] px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="truncate font-medium">
                    {s.title || shortPath(s.cwd)}
                  </span>
                  {s.liveSessionId && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      运行中
                    </span>
                  )}
                  {isOrphan && (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-600">
                      孤儿
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-xs text-[var(--color-muted-foreground)]">
                  {s.cwd}
                </span>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    {s.shell} · {formatRelative(s.lastSeenAt)}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => onLaunch(s)}
                      title={s.liveSessionId ? '接回原终端' : '重新启动并续接对话历史'}
                    >
                      <Play className="size-3.5" />
                      {s.liveSessionId ? '接回' : '续接'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(s)}
                      disabled={del.isPending}
                      title={s.liveSessionId ? '断开并删除' : '删除记录'}
                    >
                      {s.liveSessionId ? <Power className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
