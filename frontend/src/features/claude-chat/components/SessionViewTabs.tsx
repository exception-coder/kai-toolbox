import { Check, FileText, Gauge, LayoutGrid, ListChecks, MessageSquare, NotebookPen, Route, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionViewMore, type SecondarySessionViewOption } from './SessionViewMore'

export type SessionView = 'conversation' | 'trajectory' | 'autopilot' | 'autopilot_detail'
  | 'documents' | 'sites' | 'usage' | 'review' | 'supervision' | 'board' | 'communications'

interface Props {
  view: SessionView
  onSelect: (view: SessionView) => void
  hasSession: boolean
  documentTitle?: string
  siteCount: number
  pendingReviewCount?: number
  desktopOnly?: boolean
}

function viewOptions({ documentTitle, siteCount, pendingReviewCount }: Pick<Props, 'documentTitle' | 'siteCount' | 'pendingReviewCount'>) {
  const hasReview = pendingReviewCount != null
  const reviewLabel = pendingReviewCount ? '评审 ' + pendingReviewCount : '评审'
  const primary = [
    { id: 'conversation' as const, label: '对话', icon: MessageSquare },
    { id: 'autopilot' as const, label: '推进', icon: ListChecks },
    ...(documentTitle != null ? [{ id: 'documents' as const, label: '文档', icon: FileText, title: documentTitle, desktop: true }] : []),
    { id: 'usage' as const, label: '用量', icon: Gauge, desktop: true },
    ...(hasReview ? [{ id: 'review' as const, label: reviewLabel, icon: Share2, desktop: true }] : []),
  ]
  const secondary: SecondarySessionViewOption[] = [
    { id: 'communications', label: '开发待办', icon: NotebookPen },
    { id: 'trajectory', label: '轨迹', icon: Route },
    { id: 'sites', label: siteCount ? '站点 ' + siteCount : '站点', icon: LayoutGrid },
    ...(documentTitle != null ? [{ id: 'documents' as const, label: '文档', icon: FileText, mobileOnly: true }] : []),
    { id: 'usage', label: '用量', icon: Gauge, mobileOnly: true },
    ...(hasReview ? [{ id: 'review' as const, label: reviewLabel, icon: Share2, mobileOnly: true, attention: !!pendingReviewCount }] : []),
  ]
  return { primary, secondary }
}

/** 会话内视图导航；只展示和选择，数据及执行仍由原工作区持有。 */
export function SessionViewTabs({ view, onSelect, hasSession, desktopOnly, ...metadata }: Props) {
  const current = view === 'autopilot_detail' ? 'autopilot' : view
  const { primary, secondary } = viewOptions(metadata)
  return <nav aria-label="会话视图" data-focus-chrome
    className={cn('workspace-contextbar cc-chat-contextbar scrollbar-autohide items-end justify-between gap-1 overflow-x-auto px-2 sm:gap-4 sm:px-3 md:justify-start', desktopOnly ? 'hidden md:flex' : 'flex')}>
    {hasSession && primary.map(option => <button key={option.id} type="button"
      aria-current={current === option.id ? 'page' : undefined}
      title={'title' in option ? option.title : undefined} onClick={() => onSelect(option.id)}
      className={cn(
        'relative h-full shrink-0 items-center gap-1 whitespace-nowrap px-2 text-xs transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full sm:gap-1.5 sm:px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        'desktop' in option ? 'hidden md:inline-flex' : 'inline-flex',
        current === option.id ? 'font-medium text-[var(--color-primary)] after:bg-[var(--color-primary)]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] after:bg-transparent',
      )}>
      <option.icon className="size-3.5" aria-hidden="true" />{option.label}
    </button>)}
    <button type="button" aria-label="会话看板" aria-current={view === 'board' ? 'page' : undefined}
      onClick={() => onSelect('board')} className={cn(
        'relative inline-flex h-full shrink-0 items-center gap-1 whitespace-nowrap px-2 text-xs after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full sm:gap-1.5 sm:px-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
        view === 'board' ? 'font-medium text-[var(--color-primary)] after:bg-[var(--color-primary)]'
          : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] after:bg-transparent',
      )}>
      <ListChecks className="size-3.5" aria-hidden="true" /><span className="hidden md:inline">会话</span>看板
    </button>
    {hasSession && <SessionViewMore currentView={view} options={secondary} onSelect={onSelect} />}
  </nav>
}

/** 移动端在更多菜单选择视图，与桌面复用同一份能力清单。 */
export function SessionWorkViews({ view, onSelect, hasSession, ...metadata }: Props) {
  const { primary, secondary } = viewOptions(metadata)
  const current = view === 'autopilot_detail' ? 'autopilot' : view
  const options = [
    ...(hasSession ? primary.filter(option => !('desktop' in option)) : []),
    { id: 'board' as const, label: '会话看板', icon: ListChecks },
    ...(hasSession ? secondary : []),
  ]
  return <div role="group" aria-label="工作视图" className="border-b py-1">
    {options.map(option => <button key={option.id} type="button"
      aria-current={current === option.id ? 'page' : undefined}
      onClick={() => onSelect(option.id)}
      className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">
      <option.icon aria-hidden="true" className="size-4 text-[var(--color-muted-foreground)]" />
      <span className="flex-1">{option.id === 'trajectory' ? '执行轨迹' : option.id === 'usage' ? 'Token 用量'
        : option.id === 'sites' ? metadata.siteCount ? `工作站点 ${metadata.siteCount}` : '工作站点' : option.label}</span>
      {'attention' in option && option.attention && <span aria-label="有待处理评审" className="size-1.5 rounded-full bg-[var(--color-primary)]" />}
      {current === option.id && <Check aria-hidden="true" className="size-4 text-[var(--color-primary)]" />}
    </button>)}
  </div>
}
