import { FileText, X } from 'lucide-react'
import { MarkdownContent } from '@/components/markdown/MarkdownContent'
import type { PrdBusinessFields, PrdRole, PrdSessionStatus } from '../types'
import { getBusinessFieldEntries } from '../lib/sessionPresentation'

interface RequirementTypePresentation {
  label: string
  color: string
  bg: string
}

interface RawInputCardProps {
  session: {
    title: string
    project: string | null
    module: string | null
    role: PrdRole
    status: PrdSessionStatus
    rawInput: string | null
    businessFields: PrdBusinessFields
    createdAt: number
  }
  requirementType: RequirementTypePresentation
  onClose: () => void
}

export function RawInputCard({ session, requirementType, onClose }: RawInputCardProps) {
  const businessFields = getBusinessFieldEntries(session.businessFields)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raw-input-card-title"
        className="w-full max-w-xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl flex flex-col max-h-[80vh]"
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-[var(--color-primary)] flex-shrink-0" />
              <span id="raw-input-card-title" className="font-semibold text-sm truncate">
                {session.title}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {(session.project || session.module) && (
                <span className="text-[11px] text-[var(--color-muted-foreground)]">
                  {[session.project, session.module].filter(Boolean).join(' · ')}
                </span>
              )}
              <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight ${
                session.role === 'BUSINESS'
                  ? 'bg-green-500/15 text-green-500 border-green-500/20'
                  : 'bg-blue-500/15 text-blue-500 border-blue-500/20'
              }`}>
                {session.role === 'BUSINESS' ? '业务员' : '产品/开发'}
              </span>
              <span className={`text-[9px] px-1.5 py-0.5 rounded border leading-tight ${requirementType.bg} ${requirementType.color}`}>
                {requirementType.label}
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭原始需求"
            onClick={onClose}
            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {businessFields.length > 0 && (
            <div className="mb-5">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                业务需求信息
              </div>
              <dl className="grid gap-3 rounded-xl bg-[var(--color-muted)]/30 p-4 text-xs sm:grid-cols-2">
                {businessFields.map(({ label, value, wide }) => (
                  <div key={label} className={wide ? 'sm:col-span-2' : ''}>
                    <dt className="mb-1 text-[10px] text-[var(--color-muted-foreground)]">{label}</dt>
                    <dd className="whitespace-pre-wrap leading-relaxed">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          <div className="text-xs font-semibold text-[var(--color-muted-foreground)] uppercase tracking-wide mb-3">
            原始需求描述
          </div>
          {session.rawInput ? (
            <MarkdownContent
              content={session.rawInput}
              className="h-auto overflow-visible rounded-xl bg-[var(--color-muted)]/30 p-4 text-sm leading-relaxed"
            />
          ) : (
            <div className="text-sm text-[var(--color-muted-foreground)] italic">暂无原始需求描述</div>
          )}
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--color-border)] text-[11px] text-[var(--color-muted-foreground)]">
          <span>创建于 {new Date(session.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <span className="font-medium">{session.status}</span>
        </div>
      </div>
    </div>
  )
}
