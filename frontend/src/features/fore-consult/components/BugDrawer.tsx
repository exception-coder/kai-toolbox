import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bug, ChevronDown, Trash2, X } from 'lucide-react'
import { deleteBug, listBugs, updateBugStatus, type ConsultBugView } from '../api'

const BUGS_KEY = ['fore-consult-bugs']

const SEVERITY: Record<string, { label: string; cls: string }> = {
  LOW: { label: '低', cls: 'text-sky-700 border-sky-200 bg-sky-50' },
  MEDIUM: { label: '中', cls: 'text-amber-700 border-amber-200 bg-amber-50' },
  HIGH: { label: '高', cls: 'text-orange-700 border-orange-200 bg-orange-50' },
  CRITICAL: { label: '紧急', cls: 'text-red-700 border-red-200 bg-red-50' },
}
const TYPE_LABEL: Record<string, string> = {
  FUNCTION_BUG: '功能 BUG',
  DATA_ISSUE: '数据问题',
  CONFIG: '配置问题',
  PERMISSION: '权限问题',
  OTHER: '其他',
}
const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: '待核实', cls: 'text-amber-700 border-amber-200 bg-amber-50' },
  CONFIRMED: { label: '已确认', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  DUPLICATE: { label: '重复', cls: 'text-slate-600 border-slate-200 bg-slate-50' },
  FIXED: { label: '已修复', cls: 'text-emerald-700 border-emerald-200 bg-emerald-50' },
  WONTFIX: { label: '不修', cls: 'text-slate-600 border-slate-200 bg-slate-50' },
  REJECTED: { label: '驳回', cls: 'text-red-700 border-red-200 bg-red-50' },
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
      <div className="fc-panel my-3 mr-3 flex w-[min(520px,calc(100%-24px))] flex-col rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200/80 p-5">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            <Bug className="size-4 shrink-0 text-amber-600" /> Bug 登记
            <span className="truncate text-[11px] font-normal text-slate-400">AI 自动识别，待人工核实</span>
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {(bugs ?? []).length === 0 ? (
            <p className="pt-10 text-center text-sm text-slate-400">还没有登记的缺陷</p>
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
  const sev = SEVERITY[bug.severity] ?? { label: bug.severity, cls: 'text-slate-600 border-slate-200 bg-slate-50' }
  const st = STATUS[bug.status] ?? { label: bug.status, cls: 'text-slate-600 border-slate-200 bg-slate-50' }
  return (
    <li className="rounded-2xl border border-slate-200/80 bg-white/55 px-3.5 py-3 shadow-[0_12px_30px_-28px_rgba(15,23,42,0.32)] transition-colors hover:bg-white/75">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${sev.cls}`}>{sev.label}</span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] ${st.cls}`}>{st.label}</span>
            {bug.occurrenceCount > 1 && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">×{bug.occurrenceCount}</span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-sm font-medium leading-5 text-slate-900" title={bug.title}>{bug.title}</div>
          <div className="mt-0.5 text-[11px] leading-4 text-slate-500">
            {(bug.systemName ?? '—')}{bug.module ? ' · ' + bug.module : ''} · {TYPE_LABEL[bug.type] ?? bug.type}
            {bug.aiConfidence != null ? ` · 置信 ${bug.aiConfidence}%` : ''}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onToggle} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-900" aria-label={expanded ? '收起详情' : '展开详情'} aria-expanded={expanded}>
            <ChevronDown className={`size-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button type="button" onClick={onDelete} className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="删除">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2 border-t border-slate-200/80 pt-2.5 text-[12px] leading-relaxed text-slate-700">
          {bug.suspectArea && <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-500">疑似位置：</span>{bug.suspectArea}</p>}
          {bug.reproduce && <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-500">复现：</span>{bug.reproduce}</p>}
          {bug.expected && <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-500">期望：</span>{bug.expected}</p>}
          {bug.actual && <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-500">实际：</span>{bug.actual}</p>}
          {bug.question && <p className="whitespace-pre-wrap break-words"><span className="font-medium text-slate-500">用户提问：</span>{bug.question}</p>}
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
                ? 'border-sky-300 bg-sky-50 text-sky-700'
                : 'border-slate-200 bg-white/65 text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </li>
  )
}
