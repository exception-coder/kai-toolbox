import { useQuery } from '@tanstack/react-query'
import { getConsultResources, type ConsultWorkflowNode } from '../api'

const legacyQueries = new Set(['erp_db_query', 'srm_db_query', 'scm_db_query'])
const states: Record<string, string> = { AVAILABLE: '可查询', DISABLED: '已停用', UNAVAILABLE: '资源缺失', RESTRICTED: '环境受限', REGISTRATION_ONLY: '仅登记' }

/** 只保存绑定引用，连接管理继续由资源中心提供。 */
export function NodeResources({ node, onChange }: { node: ConsultWorkflowNode; onChange: (node: ConsultWorkflowNode) => void }) {
  const resources = useQuery({ queryKey: ['agent-management', 'consult-resources'], queryFn: getConsultResources })
  const selected = node.resourceBindingIds ?? []
  const toggle = (id: string, checked: boolean) => {
    const resourceBindingIds = checked ? [...new Set([...selected, id])] : selected.filter(value => value !== id)
    onChange({ ...node, resourceBindingIds,
      ...(checked ? {
        tools: [...new Set([...node.tools.filter(tool => !legacyQueries.has(tool)), 'consult_resources', 'consult_resource_query'])],
        mcpServers: [...new Set([...node.mcpServers, 'consult-readonly'])],
      } : {}),
    })
  }
  const missing = resources.data ? selected.filter(id => !resources.data.some(entry => entry.bindingId === id)) : []
  return <fieldset className="min-w-0 border-t border-slate-200 pt-5">
    <legend className="text-sm font-semibold">数据库资源</legend>
    <p className="mt-2 text-xs leading-6 text-slate-600">选择本节点允许使用的数据库。运行时只使用属于当前咨询系统的资源；选择后自动装配资源发现和只读查询工具，替换本节点的旧数据库查询工具。</p>
    <div className="my-3 flex flex-wrap gap-4 text-xs">
      <a href="/tools/reqpool/resources" target="_blank" rel="noreferrer" className="underline underline-offset-4">配置系统资源 ↗</a>
      <button type="button" disabled={resources.isFetching} onClick={() => void resources.refetch()} className="underline underline-offset-4 disabled:opacity-40">刷新资源</button>
    </div>
    {resources.isPending && <p role="status" className="text-xs">正在读取资源…</p>}
    {resources.isError && <p role="alert" className="text-xs text-red-700">资源读取失败，已保留原选择。请刷新重试。</p>}
    {resources.data?.length === 0 && <p className="py-3 text-xs text-slate-600">尚无已关联的数据库。请在资源中心配置连接，再关联到项目库系统。</p>}
    <div className="divide-y divide-slate-200">{resources.data?.map(entry => <label key={entry.bindingId} className="flex min-w-0 items-start gap-3 py-3 text-xs">
      <input type="checkbox" className="mt-1" checked={selected.includes(entry.bindingId)} disabled={entry.state !== 'AVAILABLE' && !selected.includes(entry.bindingId)} onChange={event => toggle(entry.bindingId, event.target.checked)} />
      <span className="min-w-0 break-words"><span className="block font-medium">{entry.systemName} · {entry.name}</span>
        <span className="mt-1 block text-slate-600">{entry.environment} · {states[entry.state] ?? entry.state} · {entry.purpose || '未填写用途'}</span></span>
    </label>)}</div>
    {missing.map(id => <label key={id} className="flex gap-3 py-2 text-xs text-amber-800"><input type="checkbox" checked onChange={() => toggle(id, false)} /><span className="break-all">已失效的资源绑定：{id}，可取消选择。</span></label>)}
    <p className="mt-2 text-xs leading-5 text-slate-500">凭据保留在资源中心。没有选择资源时，统一资源工具不能查询数据库。配置状态不代表已测试连接。</p>
  </fieldset>
}
