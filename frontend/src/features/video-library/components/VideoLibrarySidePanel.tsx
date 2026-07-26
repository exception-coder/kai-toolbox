import type { ComponentProps } from 'react'
import { FolderTree, List } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VideoDirectoryPanel } from './VideoDirectoryPanel'
import { VideoListPanel } from './VideoListPanel'

export type SidePanelTab = 'list' | 'dirs'

interface Props {
  tab: SidePanelTab
  onTabChange: (tab: SidePanelTab) => void
  listProps: ComponentProps<typeof VideoListPanel>
  dirProps: ComponentProps<typeof VideoDirectoryPanel>
}

/**
 * 左侧栏容器：在「视频列表」与「目录」两个视图之间切换。
 * 桌面侧栏与移动端底部 Sheet 用的是同一个实例形态（同一份 props），
 * 保证两处的 tab 状态、目录作用域、筛选条件完全一致。
 */
export function VideoLibrarySidePanel({ tab, onTabChange, listProps, dirProps }: Props) {
  const dirCount = dirProps.selectedDir ? 1 : 0
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-2 gap-1 border-b p-1">
        <TabButton active={tab === 'list'} onClick={() => onTabChange('list')}>
          <List className="h-3.5 w-3.5" />
          视频列表
        </TabButton>
        <TabButton active={tab === 'dirs'} onClick={() => onTabChange('dirs')}>
          <FolderTree className="h-3.5 w-3.5" />
          目录
          {dirCount > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-primary)]" aria-label="已按目录筛选" />
          )}
        </TabButton>
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'list' ? <VideoListPanel {...listProps} /> : <VideoDirectoryPanel {...dirProps} />}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // 移动端也是同一套：py-2 让触控热区 ≥ 36px
        'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition-colors',
        active
          ? 'bg-[var(--color-accent)] text-[var(--color-foreground)]'
          : 'text-[var(--color-muted-foreground)] hover:bg-[var(--color-accent)]/60',
      )}
    >
      {children}
    </button>
  )
}
