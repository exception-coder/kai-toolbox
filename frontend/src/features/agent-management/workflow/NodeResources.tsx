import { useQuery } from '@tanstack/react-query'
import { getConsultResources, type ConsultWorkflowNode } from '../api'

const legacyQueries = new Set(['erp_db_query', 'srm_db_query', 'scm_db_query'])
const queryEnvironments = new Set(['LOCAL', 'DEV', 'TEST', 'UAT'])
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
    <p className="mt-2 text-xs leading-6 text-slate-600">这是业务咨询数据库的唯一选择入口。只使用属于当前系统、已绑定且环境为 LOCAL / DEV / TEST / UAT 的数据库；不会读取 ERP/SRM/SCM 旧独立连接。</p>
    <div className="my-3 flex flex-wrap gap-4 text-xs">
      <a href="/tools/reqpool/resources?view=connections" target="_blank" rel="noreferrer" className="underline underline-offset-4">配置连接与系统绑定 ↗</a>
      <a href="/tools/project-workspace" target="_blank" rel="noreferrer" className="underline underline-offset-4">登记项目库系统 ↗</a>
      <button type="button" disabled={resources.isFetching} onClick={() => void resources.refetch()} className="underline underline-offset-4 disabled:opacity-40">刷新资源</button>
    </div>
    {resources.isPending && <p role="status" className="text-xs">正在读取资源…</p>}
    {resources.isError && <p role="alert" className="text-xs text-red-700">资源读取失败，已保留原选择。请刷新重试。</p>}
    {resources.data?.length === 0 && <p className="py-3 text-xs text-slate-600">尚无已关联的数据库。请在资源中心配置连接，再关联到项目库系统。</p>}
    <div className="divide-y divide-slate-200">{resources.data?.map(entry => <label key={entry.bindingId} className="flex min-w-0 items-start gap-3 py-3 text-xs">
      <input type="checkbox" className="mt-1" checked={selected.includes(entry.bindingId)} disabled={(entry.state !== 'AVAILABLE' || !queryEnvironments.has(entry.environment?.trim().toUpperCase())) && !selected.includes(entry.bindingId)} onChange={event => toggle(entry.bindingId, event.target.checked)} />
      <span className="min-w-0 break-words"><span className="block font-medium">{entry.systemName} · {entry.name}</span>
        <span className="mt-1 block text-slate-600">{entry.environment} · {states[entry.state] ?? entry.state} · {entry.purpose || '未填写用途'}</span></span>
    </label>)}</div>
    {missing.map(id => <label key={id} className="flex gap-3 py-2 text-xs text-amber-800"><input type="checkbox" checked onChange={() => toggle(id, false)} /><span className="break-all">已失效的资源绑定：{id}，可取消选择。</span></label>)}
    {node.tools.some(tool => legacyQueries.has(tool)) && <p role="status" className="my-2 text-xs text-amber-800">当前节点保留旧工具配置，但运行时已禁用旧连接；请明确选择数据库资源。</p>}
    <p className="mt-2 text-xs leading-5 text-slate-500">凭据只在资源中心保存。流程选择评测并发布后对新咨询生效；旧咨询保留选择快照。修改资源连接影响下次查询，停用绑定立即禁止后续查询。配置状态不代表已测试连接。</p>
  </fieldset>
}
