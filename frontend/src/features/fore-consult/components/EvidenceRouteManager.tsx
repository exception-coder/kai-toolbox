import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Plus, Power, Trash2, X } from 'lucide-react'
import {
  createEvidenceRoute,
  deleteEvidenceRoute,
  listEvidenceRoutes,
  updateEvidenceRoute,
  type EvidenceRouteRequest,
  type EvidenceRouteView,
} from '../api'

interface Props {
  isAdmin: boolean
  onClose: () => void
}

const EMPTY: EvidenceRouteRequest = {
  contextSystem: '', moduleName: null, businessObject: '', keywords: [], evidenceSystem: '',
  schemaSource: 'RUNTIME_METADATA', description: null, evidenceRefs: [], status: 'DRAFT',
}

function requestOf(route: EvidenceRouteView, status = route.status): EvidenceRouteRequest {
  return {
    contextSystem: route.contextSystem, moduleName: route.moduleName, businessObject: route.businessObject,
    keywords: route.keywords, evidenceSystem: route.evidenceSystem, schemaSource: route.schemaSource,
    description: route.description, evidenceRefs: route.evidenceRefs, status,
  }
}

export function EvidenceRouteManager({ isAdmin, onClose }: Props) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState<EvidenceRouteRequest>(EMPTY)
  const { data = [], isLoading } = useQuery({ queryKey: ['fore-consult-evidence-routes'], queryFn: listEvidenceRoutes })
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['fore-consult-evidence-routes'] })
    void qc.invalidateQueries({ queryKey: ['fore-consult-topology'] })
  }
  const save = useMutation({
    mutationFn: () => createEvidenceRoute(draft),
    onSuccess: () => { setDraft(EMPTY); refresh() },
  })
  const change = useMutation({
    mutationFn: ({ route, status }: { route: EvidenceRouteView; status: EvidenceRouteView['status'] }) =>
      updateEvidenceRoute(route.id, requestOf(route, status)),
    onSuccess: refresh,
  })
  const remove = useMutation({ mutationFn: deleteEvidenceRoute, onSuccess: refresh })

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" onClick={onClose}>
      <section className="fc-panel flex max-h-[86vh] w-[min(920px,96vw)] flex-col rounded-2xl" onClick={(event) => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-indigo-300/15 px-5 py-4">
          <div>
            <h2 className="font-semibold text-white">跨系统数据归属</h2>
            <p className="mt-1 text-xs text-indigo-200/55">链路分析只生成候选；确认后才会给咨询会话开放对应只读数据库和 DDL。</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-indigo-200/70 hover:bg-white/10"><X className="size-4" /></button>
        </header>

        {isAdmin && (
          <div className="grid grid-cols-2 gap-2 border-b border-indigo-300/10 p-4 md:grid-cols-6">
            <input value={draft.contextSystem} onChange={(e) => setDraft({ ...draft, contextSystem: e.target.value })} placeholder="发起系统，如 SRM" className="fc-input" />
            <input value={draft.moduleName ?? ''} onChange={(e) => setDraft({ ...draft, moduleName: e.target.value || null })} placeholder="模块（可选）" className="fc-input" />
            <input value={draft.businessObject} onChange={(e) => setDraft({ ...draft, businessObject: e.target.value })} placeholder="业务对象" className="fc-input" />
            <input value={draft.keywords.join(',')} onChange={(e) => setDraft({ ...draft, keywords: e.target.value.split(/[,，]/).map(v => v.trim()).filter(Boolean) })} placeholder="关键词，逗号分隔" className="fc-input" />
            <input value={draft.evidenceSystem} onChange={(e) => setDraft({ ...draft, evidenceSystem: e.target.value })} placeholder="权威系统，如 ERP" className="fc-input" />
            <button type="button" disabled={!draft.contextSystem.trim() || !draft.businessObject.trim() || !draft.evidenceSystem.trim() || save.isPending} onClick={() => save.mutate()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500/20 px-3 text-xs text-sky-100 disabled:opacity-40">
              {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} 新增候选
            </button>
          </div>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="size-5 animate-spin text-sky-300" /></div> : data.length === 0 ? (
            <p className="py-12 text-center text-sm text-indigo-200/45">尚无数据归属候选，可先执行“分析链路”或由管理员手工新增。</p>
          ) : data.map((route) => (
            <article key={route.id} className="rounded-xl border border-indigo-300/15 bg-white/[0.035] p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white">
                    <span>{route.contextSystem}</span><span className="text-indigo-300/40">→</span><span className="text-emerald-200">{route.evidenceSystem}</span>
                    <span className="rounded-full border border-indigo-300/20 px-2 py-0.5 text-[10px] text-indigo-100/65">{route.status}</span>
                    <span className="rounded-full border border-indigo-300/20 px-2 py-0.5 text-[10px] text-indigo-100/65">{route.source}</span>
                  </div>
                  <div className="mt-1 text-xs text-indigo-100/70">{route.moduleName ? `${route.moduleName} · ` : ''}{route.businessObject}</div>
                  {route.keywords.length > 0 && <div className="mt-1 text-[11px] text-indigo-200/45">关键词：{route.keywords.join('、')}</div>}
                  {route.description && <div className="mt-1 text-[11px] text-indigo-200/55">{route.description}</div>}
                </div>
                {isAdmin && <div className="flex gap-1.5">
                  {route.status !== 'CONFIRMED' && <button type="button" onClick={() => change.mutate({ route, status: 'CONFIRMED' })} className="rounded-lg border border-emerald-300/20 p-1.5 text-emerald-200" title="确认并启用"><Check className="size-3.5" /></button>}
                  {route.status === 'CONFIRMED' && <button type="button" onClick={() => change.mutate({ route, status: 'DISABLED' })} className="rounded-lg border border-amber-300/20 p-1.5 text-amber-200" title="停用"><Power className="size-3.5" /></button>}
                  {route.status !== 'CONFIRMED' && <button type="button" onClick={() => remove.mutate(route.id)} className="rounded-lg border border-red-300/20 p-1.5 text-red-200" title="删除"><Trash2 className="size-3.5" /></button>}
                </div>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
