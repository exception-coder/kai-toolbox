import { useState } from 'react'
import { Check, ChevronDown, Copy, ExternalLink, History, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { deleteReviewShare, reissueReviewShare, type ReviewRelationContext, type ReviewShareView } from '../api'

interface Props {
  relation: ReviewRelationContext
  onOpenSession: (sessionId: string) => void
  onChanged?: () => Promise<unknown> | void
  embedded?: boolean
}

type LinkedReview = ReviewRelationContext['reviews'][number]

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(timestamp))
}

export function reviewDisplayState(review: ReviewShareView, now = Date.now()) {
  if (review.status !== 'ACTIVE') return { label: '已撤销', tone: 'text-[var(--color-muted-foreground)]' }
  if (review.expiresAt <= now) return { label: '已过期', tone: 'text-amber-700 dark:text-amber-300' }
  return { label: '有效', tone: 'text-emerald-700 dark:text-emerald-300' }
}

function buildShareUrl(sharePath: string, lanIpv4: string) {
  const url = new URL(sharePath, window.location.origin)
  if (lanIpv4) url.hostname = lanIpv4
  return url.toString()
}

export function ReviewRelationBar({ relation, onOpenSession, onChanged, embedded = false }: Props) {
  const confirm = useConfirm()
  const [expanded, setExpanded] = useState(embedded)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [issuedUrls, setIssuedUrls] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const latest = relation.reviews[0]

  if (!latest) return null

  const reissue = async (review: LinkedReview) => {
    if (busyId || deletingId) return
    setBusyId(review.id)
    setErrors(current => ({ ...current, [review.id]: '' }))
    try {
      const result = await reissueReviewShare(review.id)
      setIssuedUrls(current => ({ ...current, [review.id]: buildShareUrl(result.sharePath, result.lanIpv4) }))
      setConfirmId(null)
      await onChanged?.()
    } catch (error) {
      const actionLabel = review.sharePath ? '换新链接' : '生成替代链接'
      setErrors(current => ({
        ...current,
        [review.id]: `${error instanceof Error && error.message !== 'HTTP 500'
          ? error.message : '链接获取失败，请稍后重试'}，可点击“${actionLabel}”重试。`,
      }))
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (review: LinkedReview) => {
    if (busyId || deletingId) return
    const accepted = await confirm({
      title: '删除计划评审？',
      description: `“${review.reviewTitle}”的公开链接、评审分析和关联反馈将永久删除，无法恢复。已进入开发对话的内容不会回滚。`,
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'destructive',
    })
    if (!accepted) return
    setDeletingId(review.id)
    setErrors(current => ({ ...current, [review.id]: '' }))
    try {
      await deleteReviewShare(review.id)
      await onChanged?.()
    } catch (error) {
      setErrors(current => ({
        ...current,
        [review.id]: `${error instanceof Error && error.message !== 'HTTP 500'
          ? error.message : '计划评审删除失败，请稍后重试'}，可再次点击“删除”重试。`,
      }))
    } finally {
      setDeletingId(null)
    }
  }

  const copyUrl = async (reviewId: string, url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(reviewId)
    window.setTimeout(() => setCopiedId(current => current === reviewId ? null : current), 1600)
  }

  if (relation.role === 'REVIEW') {
    return (
      <div className="border-b border-[var(--color-border)] bg-[var(--color-muted)]/45 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Link2 className="size-4 text-[var(--color-muted-foreground)]" />
          <span className="font-medium">来源开发会话：{latest.sourceTitle}</span>
          <Button className="ml-auto h-7 px-2" size="sm" variant="outline" onClick={() => onOpenSession(latest.sourceSessionId)}>
            返回来源会话
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className={cn('bg-[var(--color-background)]', !embedded && 'border-b border-[var(--color-border)]')} aria-label="关联计划评审">
      {!embedded && <div className="flex min-h-10 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs">
        <History className="size-4 text-[var(--color-muted-foreground)]" />
        <span className="font-medium">计划评审记录</span>
        <span className="text-[var(--color-muted-foreground)]">{relation.reviews.length} 次 · 最近：{latest.reviewTitle}</span>
        <button
          type="button"
          className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium text-[var(--color-foreground)] hover:bg-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
          aria-expanded={expanded}
          onClick={() => setExpanded(current => !current)}
        >
          {expanded ? '收起记录' : '查看记录'}
          <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>}

      {(embedded || expanded) && (
        <ol className={cn('px-3', !embedded && 'border-t border-[var(--color-border)]')} aria-label="历史计划评审">
          {relation.reviews.map((review, index) => {
            const state = reviewDisplayState(review)
            const issuedUrl = issuedUrls[review.id]
            const originalUrl = review.sharePath ? buildShareUrl(review.sharePath, relation.lanIpv4) : null
            const visibleUrl = issuedUrl ?? originalUrl
            const busy = busyId === review.id
            const deleting = deletingId === review.id
            const revoked = review.status !== 'ACTIVE'
            return (
              <li key={review.id} className="border-b border-[var(--color-border)] py-3 last:border-b-0">
                <div className="flex flex-col gap-2 md:flex-row md:items-start">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-medium text-sm">{review.reviewTitle}</span>
                      {index === 0 && <span className="text-[11px] text-[var(--color-muted-foreground)]">最近</span>}
                      <span className={cn('text-[11px] font-medium', state.tone)}>{state.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                      {review.mode === 'FULL_FORK' ? '完整上下文评审' : '安全快照评审'} · 创建于 {formatDate(review.createdAt)}
                      {review.status === 'ACTIVE' ? ` · 有效至 ${formatDate(review.expiresAt)}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button className="h-7 px-2" size="sm" variant="outline" onClick={() => onOpenSession(review.reviewSessionId)}>
                      打开分析
                    </Button>
                    <Button
                      className="h-7 px-2"
                      size="sm"
                      variant="ghost"
                      disabled={revoked || busy || busyId !== null || deletingId !== null}
                      title={revoked ? '已撤销的评审不能重新获取链接' : '重新签发后，之前的公开链接将立即失效'}
                      onClick={() => setConfirmId(review.id)}
                    >
                      <RefreshCw />
                      {issuedUrl || originalUrl ? '换新链接' : '生成替代链接'}
                    </Button>
                    <Button
                      className="h-7 px-2 text-[var(--color-destructive)] hover:text-[var(--color-destructive)]"
                      size="sm"
                      variant="ghost"
                      disabled={busyId !== null || deletingId !== null}
                      onClick={() => void remove(review)}
                    >
                      {deleting && <Loader2 className="animate-spin" />}
                      {!deleting && <Trash2 />}
                      删除
                    </Button>
                  </div>
                </div>

                {confirmId === review.id && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 border-l-2 border-amber-500 pl-3 text-xs" role="alert">
                    <span className="text-amber-800 dark:text-amber-200">
                      {originalUrl
                        ? '生成新链接后，当前展示的原链接会立即失效。'
                        : '将生成一个替代链接；旧地址若仍存在会立即失效。'}
                    </span>
                    <Button className="h-7 px-2" size="sm" disabled={busy} onClick={() => void reissue(review)}>
                      {busy && <Loader2 className="animate-spin" />}
                      确认生成
                    </Button>
                    <Button className="h-7 px-2" size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmId(null)}>
                      取消
                    </Button>
                  </div>
                )}

                {visibleUrl && (
                  <div className="mt-2 flex flex-col gap-2 border-l-2 border-[var(--color-primary)] pl-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium">
                        {issuedUrl ? '新链接已生成，之前的公开链接已失效' : '原始评审链接'}
                      </p>
                      <p className="truncate text-xs text-[var(--color-muted-foreground)]" title={visibleUrl}>{visibleUrl}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button className="h-7 px-2" size="sm" variant="ghost" onClick={() => void copyUrl(review.id, visibleUrl)}>
                        {copiedId === review.id ? <Check /> : <Copy />}
                        {copiedId === review.id ? '已复制' : '复制'}
                      </Button>
                      <Button className="h-7 px-2" size="sm" variant="outline" onClick={() => window.open(visibleUrl, '_blank', 'noopener,noreferrer')}>
                        <ExternalLink />打开链接
                      </Button>
                    </div>
                  </div>
                )}
                {!visibleUrl && (
                  <p className="mt-2 border-l-2 border-[var(--color-border)] pl-3 text-xs text-[var(--color-muted-foreground)]">
                    原链接创建时未留存，无法从安全摘要恢复。
                  </p>
                )}
                {errors[review.id] && (
                  <p className="mt-2 text-xs text-[var(--color-destructive)]" role="alert">
                    {errors[review.id]}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
