import { CheckCircle2, CircleDashed, FileCode2, ShieldCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OpenSpecAffectedApiEvidence } from '../types'

const CHANGE_LABELS = { ADDED: '新增', MODIFIED: '调整', REMOVED: '删除' } as const

/** OpenSpec change 下由受监督会话自动归集的接口影响证据。 */
export function AffectedApiEvidenceSection({ entries }: { entries: OpenSpecAffectedApiEvidence[] }) {
  const unverified = entries.filter(entry => entry.verificationStatus === 'UNVERIFIED').length
  const failed = entries.filter(entry => entry.verificationStatus === 'FAILED').length
  const ready = entries.length > 0 && unverified === 0 && failed === 0

  return (
    <section className="mt-6 border-t border-[var(--color-border)] pt-4" aria-labelledby="openspec-affected-api-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="openspec-affected-api-title" className="text-xs font-semibold">接口影响</h3>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">由绑定此 change 的受监督会话自动归集</p>
        </div>
        {entries.length > 0 && (
          <span className={cn('shrink-0 text-[10px] font-medium', ready
            ? 'text-emerald-700 dark:text-emerald-300'
            : failed > 0 ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-300')}>
            {entries.length} 项 · {ready ? '验证已就绪' : failed > 0 ? `${failed} 项失败` : `${unverified} 项待验证`}
          </span>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">
          当前 change 尚无可归属的服务端接口证据。接口仅从已绑定 OpenSpec 自动监督的会话登记中汇总。
        </p>
      ) : (
        <div className="scrollbar-autohide mt-3 max-h-72 divide-y divide-[var(--color-border)] overflow-y-auto border-y border-[var(--color-border)]">
          {entries.map(entry => <AffectedApiEvidenceRow key={`${entry.httpMethod}-${entry.apiPath}`} entry={entry} />)}
        </div>
      )}
    </section>
  )
}

function AffectedApiEvidenceRow({ entry }: { entry: OpenSpecAffectedApiEvidence }) {
  const StatusIcon = entry.verificationStatus === 'PASSED' ? CheckCircle2
    : entry.verificationStatus === 'FAILED' ? XCircle
      : entry.verificationStatus === 'NOT_APPLICABLE' ? ShieldCheck : CircleDashed
  return (
    <article className="py-3">
      <div className="flex min-w-0 items-start gap-2">
        <span className={cn(
          'mt-0.5 inline-flex min-w-12 shrink-0 justify-center rounded border px-1 py-0.5 font-mono text-[9px] font-semibold',
          methodTone(entry.httpMethod),
        )}>{entry.httpMethod}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <code className="break-all text-[11px] font-medium leading-4">{entry.apiPath}</code>
            <span className={cn('mt-0.5 flex shrink-0 items-center gap-1 text-[10px]', statusTone(entry.verificationStatus))}>
              <StatusIcon className="size-3" aria-hidden="true" />{statusLabel(entry.verificationStatus)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-muted-foreground)]">
            {CHANGE_LABELS[entry.changeType]}{entry.summary ? ` · ${entry.summary}` : ''}
          </p>
          <div className="mt-1.5 flex min-w-0 items-start gap-1.5 text-[10px] text-[var(--color-muted-foreground)]">
            <FileCode2 className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-all">{entry.sourceFile}{entry.handlerName ? ` · ${entry.handlerName}` : ''}</span>
          </div>
          {entry.verificationSummary && (
            <p className="mt-1.5 text-[10px] leading-4 text-[var(--color-muted-foreground)]">
              {entry.verificationMethod && <span className="font-medium text-[var(--color-foreground)]">{entry.verificationMethod} · </span>}
              {entry.verificationSummary}
            </p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[var(--color-muted-foreground)]">
            <a href={`/tools/claude-chat?sessionId=${encodeURIComponent(entry.sessionId)}`} className="truncate text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]">会话 {shortId(entry.sessionId)}</a>
            <time className="shrink-0" dateTime={entry.updatedAt}>{formatTime(entry.updatedAt)}</time>
          </div>
        </div>
      </div>
    </article>
  )
}

function statusLabel(status: OpenSpecAffectedApiEvidence['verificationStatus']) {
  if (status === 'PASSED') return '已通过'
  if (status === 'FAILED') return '失败'
  if (status === 'NOT_APPLICABLE') return '不适用'
  return '待验证'
}

function statusTone(status: OpenSpecAffectedApiEvidence['verificationStatus']) {
  if (status === 'PASSED') return 'text-emerald-600 dark:text-emerald-400'
  if (status === 'FAILED') return 'text-red-600 dark:text-red-400'
  if (status === 'NOT_APPLICABLE') return 'text-[var(--color-muted-foreground)]'
  return 'text-amber-600 dark:text-amber-400'
}

function methodTone(method: string) {
  if (method === 'GET' || method === 'HEAD') return 'border-emerald-500/30 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300'
  if (method === 'DELETE') return 'border-red-500/30 bg-red-500/8 text-red-700 dark:text-red-300'
  if (method === 'POST') return 'border-blue-500/30 bg-blue-500/8 text-blue-700 dark:text-blue-300'
  return 'border-amber-500/30 bg-amber-500/8 text-amber-700 dark:text-amber-300'
}

function shortId(sessionId: string) { return sessionId.length > 8 ? `${sessionId.slice(0, 8)}…` : sessionId }
function formatTime(value: string) { return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) }
