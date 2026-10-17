import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { correctConsultSourceRouting, getConsultSourceRouting } from '../api'

/** 自动范围与可恢复的用户纠正，保持在原咨询中，不清空问题或附件。 */
export function ConsultRoutingStatus({ consultId }: { consultId: string }) {
  const qc = useQueryClient()
  const [correcting, setCorrecting] = useState(false)
  const scope = useQuery({ queryKey: ['consult-source-routing', consultId],
    queryFn: () => getConsultSourceRouting(consultId), refetchInterval: 5000 })
  const correction = useMutation({ mutationFn: (project: string) => correctConsultSourceRouting(consultId, project),
    onSuccess: value => {
      qc.setQueryData(['consult-source-routing', consultId], value)
      void qc.invalidateQueries({ queryKey: ['fore-consult-sessions'] })
      setCorrecting(false)
    },
  })
  if (scope.isError) return <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600">
    暂时无法读取识别范围，当前草稿保留。
    <button type="button" className="ml-2 underline" onClick={() => void scope.refetch()}>重试</button>
  </div>
  if (!scope.data) return null
  const current = scope.data.projects.find(project => project.id === scope.data?.focusedProject)
  return <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-600" aria-label="系统识别范围">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span>{current ? `服务端焦点：${current.label}` : '自动识别中，先核查最匹配的系统'}
        {current && <span className="ml-2 text-slate-500">{scope.data.selectedBy === 'USER' ? '用户指定' : '依据源码定位'}</span>}
      </span>
      <button type="button" onClick={() => setCorrecting(value => !value)}
        className="rounded px-2 py-1 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-500"
        aria-expanded={correcting}>纠正系统</button>
    </div>
    <p className="mt-1 break-words text-[11px] text-slate-500">候选：{scope.data.projects.map(project => project.label).join('、') || '当前项目已不可用，请检查项目库设置'}</p>
    {correcting && <div className="mt-2 flex flex-wrap items-center gap-2">
      <select aria-label="指定对应服务端" value="" disabled={correction.isPending}
        className="min-w-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
        onChange={event => { if (event.target.value) correction.mutate(event.target.value) }}>
        <option value="" disabled>选择对应服务端</option>
        {scope.data.projects.map(project => <option key={project.id} value={project.id}>{project.label}</option>)}
      </select>
      <span>{correction.isPending ? '保存中…' : '仅纠正分析焦点，保留当前对话和草稿'}</span>
    </div>}
    {correction.isError && <p role="alert" className="mt-1 text-red-600">纠正未保存：{correction.error.message}，可重新选择。</p>}
  </div>
}
