import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, ChevronDown, Trash2, X } from 'lucide-react'
import { deleteBug, listBugs, updateBugStatus, type ConsultBugView } from '../api'

const BUGS_KEY = ['fore-consult-bugs']

const SEVERITY: Record<string, { label: string; cls: string }> = {
  LOW: { label: '低', cls: 'text-sky-300 border-sky-300/30 bg-sky-400/10' },
  MEDIUM: { label: '中', cls: 'text-amber-300 border-amber-300/30 bg-amber-400/10' },
  HIGH: { label: '高', cls: 'text-orange-300 border-orange-300/30 bg-orange-400/10' },
  CRITICAL: { label: '紧急', cls: 'text-red-300 border-red-300/30 bg-red-400/10' },
}
const TYPE_LABEL: Record<string, string> = {
  FUNCTION_BUG: '功能 BUG',
  DATA_ISSUE: '数据问题',
  CONFIG: '配置问题',
  PERMISSION: '权限问题',
  OTHER: '其他',
}
const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: '待核实', cls: 'text-amber-200 border-amber-300/30 bg-amber-400/10' },
  CONFIRMED: { label: '已确认', cls: 'text-emerald-200 border-emerald-300/30 bg-emerald-400/10' },
  DUPLICATE: { label: '重复', cls: 'text-indigo-200 border-indigo-300/25 bg-white/5' },
  FIXED: { label: '已修复', cls: 'text-emerald-200 border-emerald-300/30 bg-emerald-400/10' },
  WONTFIX: { label: '不修', cls: 'text-indigo-200 border-indigo-300/25 bg-white/5' },
  REJECTED: { label: '驳回', cls: 'text-red-200 border-red-300/30 bg-red-400/10' },
}
const ACTIONS: Array<{ status: string; label: string }> = [
  { status: 'CONFIRMED', label: '确认' },
  { status: 'FIXED', label: '已修复' },
  { status: 'DUPLICATE', label: '重复' },
  { status: 'REJECTED', label: '驳回' },
]

export function BugDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { data: bugs } = useQuery({ queryKey: BUGS_KEY, queryFn: listBugs })
  const [expanded, setExpanded] = useState<string | null>(null)

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => updateBugStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUGS_KEY }),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteBug(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: BUGS_KEY }),
  })

  return (
    <div className="fc-backdrop absolute inset-0 z-30 flex justify-end" onClick={onClose}>
      <div className="fc-panel flex h-full w-[min(520px,94vw)] flex-col rounded-l-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-indigo-300/12 p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Bug className="size-4 text-amber-300" /> Bug 登记
            <span className="text-[11px] font-normal text-indigo-200/50">（AI 自动识别，待人工核实）</span>
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {(bugs ?? []).length === 0 ? (
            <p className="pt-10 text-center text-sm text-indigo-200/40">还没有登记的缺陷</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {(bugs ?? []).map((b) => (
                <BugCard
                  key={b.bugId}
                  bug={b}
                  expanded={expanded === b.bugId}
                  onToggle={() => setExpanded((v) => (v === b.bugId ? null : b.bugId))}
                  onStatus={(status) => statusMut.mutate({ id: b.bugId, status })}
                  onDelete={() => delMut.mutate(b.bugId)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

function BugCard({
  bug,
  expanded,
  onToggle,
  onStatus,
  onDelete,
}: {
  bug: ConsultBugView
  expanded: boolean
  onToggle: () => void
  onStatus: (status: string) => void
  onDelete: () => void
}) {
  const sev = SEVERITY[bug.severity] ?? { label: bug.severity, cls: 'text-indigo-200 border-indigo-300/25 bg-white/5' }
  const st = STATUS[bug.status] ?? { label: bug.status, cls: 'text-indigo-200 border-indigo-300/25 bg-white/5' }
  return (
    <li className="rounded-xl border border-indigo-300/15 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sev.cls}`}>{sev.label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
            {bug.occurrenceCount > 1 && (
              <span className="rounded-full border border-indigo-300/25 bg-white/5 px-2 py-0.5 text-[10px] text-indigo-200/70">×{bug.occurrenceCount}</span>
            )}
          </div>
          <div className="mt-1 truncate text-sm font-medium text-white" title={bug.title}>{bug.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-indigo-200/50">
            {(bug.systemName ?? '—')}{bug.module ? ' · ' + bug.module : ''} · {TYPE_LABEL[bug.type] ?? bug.type}
            {bug.aiConfidence != null ? ` · 置信 ${bug.aiConfidence}%` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onToggle} className="rounded-lg p-1 text-indigo-200/60 hover:bg-white/10" aria-label="展开">
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg p-1 text-indigo-200/50 hover:bg-white/10 hover:text-red-300" aria-label="删除">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-1.5 border-t border-indigo-300/10 pt-2.5 text-[12px] leading-relaxed text-indigo-100/80">
          {bug.suspectArea && <p><span className="text-indigo-200/50">疑似位置：</span>{bug.suspectArea}</p>}
          {bug.reproduce && <p><span className="text-indigo-200/50">复现：</span>{bug.reproduce}</p>}
          {bug.expected && <p><span className="text-indigo-200/50">期望：</span>{bug.expected}</p>}
          {bug.actual && <p><span className="text-indigo-200/50">实际：</span>{bug.actual}</p>}
          {bug.question && <p><span className="text-indigo-200/50">用户提问：</span>{bug.question}</p>}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.status}
            type="button"
            onClick={() => onStatus(a.status)}
            disabled={bug.status === a.status}
            className={`rounded-md border px-2.5 py-1 text-[11px] transition-colors ${
              bug.status === a.status
                ? 'border-sky-300/50 bg-sky-400/20 text-sky-100'
                : 'border-indigo-300/22 bg-white/[0.04] text-indigo-100/70 hover:bg-white/10'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  )
}
