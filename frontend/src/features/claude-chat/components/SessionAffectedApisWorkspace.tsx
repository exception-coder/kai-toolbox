import { AlertTriangle, CheckCircle2, CircleDashed, Code2, FileCode2, ShieldCheck, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AffectedApiReadiness, SessionAffectedApi } from '../types'

interface Props {
  entries: SessionAffectedApi[]
  readiness: AffectedApiReadiness | null
}

const CHANGE_LABELS = { ADDED: '新增', MODIFIED: '调整', REMOVED: '删除' } as const

/** 会话涉及接口的只读审阅工作区；验证事实与登记事实分层展示。 */
export function SessionAffectedApisWorkspace({ entries, readiness }: Props) {
  return (
    <section className="cc-skin-view flex min-h-0 flex-1 flex-col bg-[var(--color-background)]">
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Code2 className="size-4 text-[var(--color-primary)]" />
              <h2 className="text-sm font-semibold">涉及接口</h2>
              <span className="text-[11px] text-[var(--color-muted-foreground)]">{entries.length} 项</span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
              Agent 自动登记本次服务端接口变更；已登记不代表已验证。
            </p>
          </div>
          <ReadinessBadge readiness={readiness} />
        </div>
        {readiness && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-muted-foreground)]">
            <span>已通过 {readiness.passed}</span>
            <span>待验证 {readiness.unverified}</span>
            <span className={readiness.failed > 0 ? 'font-medium text-red-600 dark:text-red-400' : undefined}>失败 {readiness.failed}</span>
            {readiness.notApplicable > 0 && <span>不适用 {readiness.notApplicable}</span>}
          </div>
        )}
      </header>

      <div className="scrollbar-autohide min-h-0 flex-1 overflow-y-auto">
        <div className="divide-y divide-[var(--color-border)]">
          {entries.map(entry => <AffectedApiRow key={entry.id} entry={entry} />)}
        </div>
      </div>
    </section>
  )
}

function AffectedApiRow({ entry }: { entry: SessionAffectedApi }) {
  const StatusIcon = entry.verificationStatus === 'PASSED' ? CheckCircle2
    : entry.verificationStatus === 'FAILED' ? XCircle
      : entry.verificationStatus === 'NOT_APPLICABLE' ? ShieldCheck : CircleDashed
  return (
    <article className="px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={cn(
          'mt-0.5 inline-flex min-w-14 shrink-0 justify-center rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold',
          methodTone(entry.httpMethod),
        )}>{entry.httpMethod}</span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <code className="break-all text-xs font-medium text-[var(--color-foreground)]">{entry.apiPath}</code>
            <span className="rounded-full bg-[var(--color-muted)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted-foreground)]">
              {CHANGE_LABELS[entry.changeType]}
            </span>
          </div>
          {entry.summary && <p className="mt-1 text-xs leading-5 text-[var(--color-muted-foreground)]">{entry.summary}</p>}
          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--color-muted-foreground)]">
            <FileCode2 className="size-3 shrink-0" />
            <span className="truncate" title={entry.sourceFile}>{entry.sourceFile}</span>
            {entry.handlerName && <span className="hidden shrink-0 sm:inline">· {entry.handlerName}</span>}
          </div>
          {entry.verificationSummary && (
            <p className="mt-2 rounded-md bg-[var(--color-muted)]/60 px-2 py-1.5 text-[11px] text-[var(--color-muted-foreground)]">
              {entry.verificationMethod && <span className="font-medium text-[var(--color-foreground)]">{entry.verificationMethod} · </span>}
              {entry.verificationSummary}
            </p>
          )}
        </div>
        <div className={cn('flex shrink-0 items-center gap-1 text-[11px]', statusTone(entry.verificationStatus))}>
          <StatusIcon className="size-3.5" />
          <span className="hidden sm:inline">{statusLabel(entry.verificationStatus)}</span>
        </div>
      </div>
    </article>
  )
}

function ReadinessBadge({ readiness }: { readiness: AffectedApiReadiness | null }) {
  if (!readiness) return <span className="text-[11px] text-[var(--color-muted-foreground)]">正在汇总…</span>
  return readiness.ready ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
      <CheckCircle2 className="size-3.5" />发布检查已就绪
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
      <AlertTriangle className="size-3.5" />发布前仍需验证
    </span>
  )
}

function statusLabel(status: SessionAffectedApi['verificationStatus']) {
  if (status === 'PASSED') return '已通过'
  if (status === 'FAILED') return '失败'
  if (status === 'NOT_APPLICABLE') return '不适用'
  return '待验证'
}

function statusTone(status: SessionAffectedApi['verificationStatus']) {
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
