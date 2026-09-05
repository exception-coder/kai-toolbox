import { FileText } from 'lucide-react'
import type { OpenSpecChangeDetail, OpenSpecTask } from '../types'
import { AffectedApiEvidenceSection } from './AffectedApiEvidenceSection'

export function TaskInspector({ detail, task }: { detail: OpenSpecChangeDetail; task: OpenSpecTask | null }) {
  return (
    <aside className="min-w-0 border-t border-[var(--color-border)] pt-4 xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-foreground)]">Inspector</p>
      <h2 className="mt-2 text-sm font-semibold">{task ? `${task.outlineId} · 任务详情` : '需求文件'}</h2>
      {task ? (
        <div className="mt-4">
          <p className="text-sm leading-6">{task.description}</p>
          <dl className="mt-5 grid grid-cols-[64px_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-[var(--color-muted-foreground)]">状态</dt><dd>{taskStateLabel(task.state)}</dd>
            <dt className="text-[var(--color-muted-foreground)]">任务 ID</dt><dd className="font-mono">{task.id}</dd>
            {task.runtime?.attentionReason && <><dt className="text-[var(--color-muted-foreground)]">需处理</dt><dd>{task.runtime.attentionReason}</dd></>}
          </dl>
          {task.runtime?.sessionId && (
            <a
              href={`/tools/claude-chat?sessionId=${encodeURIComponent(task.runtime.sessionId)}`}
              className="mt-4 inline-flex text-xs font-medium text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
            >
              进入开发会话
            </a>
          )}
        </div>
      ) : <p className="mt-3 text-xs leading-5 text-[var(--color-muted-foreground)]">选择任务可查看其执行证据。当前看板只读，完成事实仍由 OpenSpec 管理。</p>}

      <AffectedApiEvidenceSection entries={detail.affectedApis ?? []} />

      <div className="mt-6 border-t border-[var(--color-border)] pt-4">
        <h3 className="text-xs font-semibold">规格文件</h3>
        <div className="mt-2 space-y-2">
          {Object.entries(detail.artifactPaths).flatMap(([kind, paths]) => paths.map(path => (
            <div key={`${kind}-${path}`} className="flex items-start gap-2 text-xs">
              <FileText className="mt-0.5 size-3.5 shrink-0 text-[var(--color-muted-foreground)]" />
              <div className="min-w-0"><p className="font-medium">{artifactLabel(kind)}</p><p className="mt-0.5 break-all font-mono text-[10px] text-[var(--color-muted-foreground)]">{path}</p></div>
            </div>
          )))}
        </div>
      </div>
    </aside>
  )
}

function taskStateLabel(state: OpenSpecTask['state']) {
  return { TODO: '待执行', IN_PROGRESS: '进行中', IN_REVIEW: '待验证', BLOCKED: '阻塞', DONE: '已完成' }[state]
}

function artifactLabel(kind: string) {
  return { proposal: '需求提案', specs: '行为规格', design: '技术设计', tasks: '任务清单' }[kind] ?? kind
}
