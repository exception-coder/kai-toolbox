import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock, Film, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getRecentVideos, thumbUrl } from '../api'
import type { RecentVideo, VideoLibraryItem } from '../types'

interface Props {
  /** Highlight ring around the currently-playing card. {@code null} when the player is empty. */
  selectedPath: string | null
  onSelect: (item: VideoLibraryItem) => void
}

/**
 * Horizontal rail of the 10 most-recently-played videos. Hidden entirely when the recents list
 * is empty so a clean install doesn't show a useless empty band. Cards reuse the same thumbnail
 * URL helper as the main library — Spring serves the same cached JPEG.
 */
export function RecentVideosBar({ selectedPath, onSelect }: Props) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['video-library-recent'],
    queryFn: () => getRecentVideos(10),
    // 30 s is a fair compromise: long enough that scrolling around the page doesn't refetch,
    // short enough that the bar feels live after the user comes back from playing something.
    staleTime: 30_000,
  })

  const items = query.data ?? []
  if (items.length === 0) return null

  return (
    <section className="rounded-md border bg-[var(--color-card)] px-3 py-2">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-[var(--color-muted-foreground)]" />
          <span className="text-xs font-medium">最近访问</span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">共 {items.length}</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => qc.invalidateQueries({ queryKey: ['video-library-recent'] })}
          disabled={query.isFetching}
          className="h-6 w-6 p-0"
          aria-label="刷新最近访问"
        >
          <RefreshCw className={cn('h-3 w-3', query.isFetching && 'animate-spin')} />
        </Button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {items.map(r => (
          <RecentCard
            key={r.item.path}
            recent={r}
            selected={r.item.path === selectedPath}
            onClick={() => onSelect(r.item)}
          />
        ))}
      </div>
    </section>
  )
}

function RecentCard({ recent, selected, onClick }: { recent: RecentVideo; selected: boolean; onClick: () => void }) {
  const { item, lastAccessAt } = recent
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex w-32 shrink-0 flex-col items-stretch overflow-hidden rounded-md border bg-[var(--color-muted)]/20 text-left transition',
        'hover:border-[var(--color-foreground)]/40',
        selected && 'ring-1 ring-[var(--color-foreground)]',
      )}
      title={item.path}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black/10">
        <img
          src={thumbUrl(item.scanId, item.path)}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
        />
        <Film className="absolute right-1 top-1 h-3 w-3 text-white/80 drop-shadow" />
      </div>
      <div className="px-1.5 py-1">
        <div className="truncate text-[11px] font-medium" title={item.name}>{item.name}</div>
        <div className="text-[10px] text-[var(--color-muted-foreground)]">{relativeTime(lastAccessAt)}</div>
      </div>
    </button>
  )
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`
  const d = new Date(epochMs)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
