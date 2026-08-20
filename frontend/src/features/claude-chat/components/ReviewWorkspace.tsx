import { ListChecks, Loader2, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReviewFeedbackView, ReviewRelationContext } from '../api'
import { ReviewRelationBar } from './ReviewRelationBar'

interface Props {
  relation: ReviewRelationContext
  feedbackBusy: boolean
  feedbackError: string | null
  onOpenSession: (sessionId: string) => void
  onChanged: () => Promise<unknown> | void
  onApplyFeedbacks: (feedbacks: ReviewFeedbackView[]) => Promise<unknown> | void
  onDismissFeedback: (feedbackId: string) => Promise<unknown> | void
}

export function ReviewWorkspace({
  relation,
  feedbackBusy,
  feedbackError,
  onOpenSession,
  onChanged,
  onApplyFeedbacks,
  onDismissFeedback,
}: Props) {
  const pending = relation.role === 'SOURCE' ? relation.pendingFeedback : []

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-background)]" aria-label="计划评审工作区">
      {pending.length > 0 && (
        <section className="border-b border-amber-200 bg-amber-50/70 px-3 py-3 dark:border-amber-800 dark:bg-amber-950/20" aria-labelledby="pending-review-feedback-title">
          <div className="flex flex-wrap items-center gap-2 text-xs text-amber-900 dark:text-amber-100">
            <div className="min-w-0 flex-1">
              <h2 id="pending-review-feedback-title" className="font-medium">待处理评审意见 · {pending.length} 条</h2>
              <p className="mt-0.5 text-amber-700/80 dark:text-amber-300/80">可逐条生成开发草稿，也可合并后统一处理。</p>
            </div>
            {pending.length > 1 && (
              <Button
                size="sm"
                className="h-8 gap-1.5 px-2 text-xs"
                disabled={feedbackBusy}
                onClick={() => void onApplyFeedbacks(pending)}
              >
                {feedbackBusy ? <Loader2 className="size-3.5 animate-spin" /> : <ListChecks className="size-3.5" />}
                合并全部生成草稿
              </Button>
            )}
          </div>
          {feedbackError && <p className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">{feedbackError}</p>}
          <ul className="mt-2 divide-y divide-amber-200 border-y border-amber-200 dark:divide-amber-800 dark:border-amber-800">
            {pending.map(feedback => {
              const reviewTitle = relation.reviews.find(review => review.reviewSessionId === feedback.reviewSessionId)?.reviewTitle
              return (
                <li key={feedback.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start">
                  <MessageSquare className="mt-0.5 hidden size-4 shrink-0 text-amber-600 sm:block" />
                  <div className="min-w-0 flex-1 text-xs">
                    <p className="font-medium text-amber-900 dark:text-amber-100">
                      评审意见{reviewTitle ? ` · 来自 ${reviewTitle}` : ''}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[var(--color-muted-foreground)]">{feedback.content}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" className="h-8 flex-1 px-2 text-xs sm:flex-none" disabled={feedbackBusy} onClick={() => void onApplyFeedbacks([feedback])}>生成开发草稿</Button>
                    <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" disabled={feedbackBusy} onClick={() => void onDismissFeedback(feedback.id)}>忽略</Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <ReviewRelationBar relation={relation} onOpenSession={onOpenSession} onChanged={onChanged} embedded />
    </div>
  )
}
