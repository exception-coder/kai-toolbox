import { useEffect, useRef, useState } from 'react'
import { FolderTree, ListVideo, Play, Star, X } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { VideoDirectoryPanel } from './VideoDirectoryPanel'
import type { VideoDirectoryFacet, VideoLibraryItem } from '../types'

/** 目录浏览所需的一组 props，与工作台侧栏用的是同一份（作用域状态在页面手里）。 */
export interface PlaylistDirProps {
  facets: VideoDirectoryFacet[]
  loading: boolean
  selectedDir: string | null
  onSelect: (dir: string | null) => void
}

interface Props {
  items: VideoLibraryItem[]
  currentPath: string | null
  onSelect: (item: VideoLibraryItem) => void
  onToggleFavorite: (item: VideoLibraryItem) => void
  onClose: () => void
  /** 面板是否可见。不可见时跳过「滚动到当前项」，免得在隐藏状态里白算一次布局。 */
  open: boolean
  /** 给了才出现「目录」页签：播放器里也能换目录，不必退回工作台侧栏。 */
  dirProps?: PlaylistDirProps
  className?: string
}

/**
 * 播放器自带的播放列表（PotPlayer 那种贴着画面的队列），全屏浮层与非全屏侧贴共用同一份实现：
 * 差异只有外层容器的定位与宽度，交给调用方用 className 决定。
 *
 * 列表只渲染当前已加载的队列 —— 与播放器的「上一个 / 下一个」取的是同一个数组，
 * 保证列表里看到的顺序就是按下一集时真正会播的顺序。
 */
export function PlayerPlaylistPanel({
  items,
  currentPath,
  onSelect,
  onToggleFavorite,
  onClose,
  open,
  dirProps,
  className,
}: Props) {
  const activeRef = useRef<HTMLButtonElement | null>(null)
  const [tab, setTab] = useState<'list' | 'dirs'>('list')
  const currentIndex = items.findIndex(it => it.path === currentPath)

  // 打开或换片时把当前项滚到中间。block:'center' + nearest 容器滚动，不会带动整页。
  useEffect(() => {
    if (!open || tab !== 'list') return
    activeRef.current?.scrollIntoView({ block: 'center' })
  }, [open, currentPath, tab])

  return (
    <div className={cn('flex flex-col bg-black/90 text-white backdrop-blur-md', className)}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        {dirProps ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <TabBtn active={tab === 'list'} onClick={() => setTab('list')}>
              <ListVideo className="h-3.5 w-3.5" />
              队列
              <span className="tabular-nums opacity-60">
                {currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : items.length}
              </span>
            </TabBtn>
            <TabBtn active={tab === 'dirs'} onClick={() => setTab('dirs')}>
              <FolderTree className="h-3.5 w-3.5" />
              目录
              {dirProps.selectedDir && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" />}
            </TabBtn>
          </div>
        ) : (
          <div className="min-w-0 truncate text-xs font-medium">
            播放列表
            <span className="ml-1 tabular-nums text-white/50">
              {currentIndex >= 0 ? `${currentIndex + 1}/${items.length}` : items.length}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭播放列表"
          className="shrink-0 rounded p-1.5 text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {dirProps && tab === 'dirs' ? (
        <VideoDirectoryPanel
          tone="dark"
          compact
          className="min-h-0 flex-1"
          facets={dirProps.facets}
          loading={dirProps.loading}
          selectedDir={dirProps.selectedDir}
          onSelect={dir => {
            dirProps.onSelect(dir)
            // 选完目录立刻切回队列：用户点目录的意图是"播这个目录里的片"，
            // 队列此时已按新作用域重新加载，停在目录树上等于还要再点一下。
            if (dir) setTab('list')
          }}
        />
      ) : items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-xs text-white/50">
          队列为空
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
          {items.map((it, idx) => {
            const isActive = it.path === currentPath
            return (
              <li key={it.path} className="group relative">
                <button
                  ref={isActive ? activeRef : null}
                  type="button"
                  onClick={() => onSelect(it)}
                  title={it.path}
                  className={cn(
                    // py-2 + 两行文本 ≈ 48px，手指点得中；序号列固定宽度让文件名左边缘对齐
                    'flex w-full items-start gap-2 rounded-md py-2 pl-2 pr-8 text-left transition-colors',
                    isActive ? 'bg-[var(--color-primary)]/25' : 'hover:bg-white/10',
                  )}
                >
                  <span className="mt-0.5 w-6 shrink-0 text-right text-[11px] tabular-nums text-white/40">
                    {isActive ? <Play className="ml-auto h-3 w-3 fill-current text-[var(--color-primary)]" /> : idx + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'line-clamp-2 break-all text-[11px] leading-tight',
                        isActive ? 'font-semibold text-white' : 'text-white/80',
                      )}
                    >
                      {it.name}
                    </span>
                    <span className="mt-0.5 block text-[10px] tabular-nums text-white/40">
                      {formatBytes(it.size)}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation()
                    onToggleFavorite(it)
                  }}
                  title={it.favorited ? '取消收藏' : '收藏'}
                  className={cn(
                    'absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 transition-opacity',
                    it.favorited
                      ? 'text-amber-400 opacity-100'
                      : 'text-white/40 opacity-0 hover:text-amber-300 group-hover:opacity-100',
                    // 触屏没有 hover，移动端常驻显示，否则收藏按钮点不出来
                    'max-md:opacity-100',
                  )}
                >
                  <Star className={cn('h-3.5 w-3.5', it.favorited && 'fill-current')} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
        active ? 'bg-white/15 text-white' : 'text-white/55 hover:bg-white/10 hover:text-white/85',
      )}
    >
      {children}
    </button>
  )
}
