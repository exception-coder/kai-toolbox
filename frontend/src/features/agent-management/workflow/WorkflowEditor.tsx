import { NodeResources } from './NodeResources'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { getWorkflowDefaults, type AgentCapability, type ConsultWorkflow, type ConsultWorkflowNode } from '../api'

const control = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-600 focus:outline-none focus:ring-1 focus:ring-slate-600'

/** 节点规则编辑与能力装配；复用父级版本保存，不另建配置生命周期。 */
export function WorkflowEditor({ workflow, registry, onChange }: {
  workflow?: ConsultWorkflow | null
  registry: AgentCapability[]
  onChange: (workflow: ConsultWorkflow) => void
}) {
  const defaults = useQuery({ queryKey: ['agent-management', 'workflow-defaults'], queryFn: getWorkflowDefaults, enabled: !workflow })
  const [selectedId, setSelectedId] = useState<string>()
  const current = workflow ?? defaults.data
  if (!current) return <div role="status" className="py-6 text-sm text-slate-600">
    {defaults.isError ? <><p>流程读取失败，已保留当前版本。</p><button className="mt-3 underline" onClick={() => void defaults.refetch()}>重新读取流程</button></> : '正在读取流程节点…'}
  </div>
  const selected = current.nodes.find(node => node.id === selectedId) ?? current.nodes[0]
  const update = (node: ConsultWorkflowNode) => onChange({ nodes: current.nodes.map(item => item.id === selected.id ? node : item) })
  const move = (offset: number) => {
    const nodes = [...current.nodes]
    const index = nodes.indexOf(selected)
    const target = index + offset
    if (target < 0 || target >= nodes.length) return
    ;[nodes[index], nodes[target]] = [nodes[target], nodes[index]]
    setSelectedId(selected.id)
    onChange({ nodes })
  }
  const add = () => {
    const node: ConsultWorkflowNode = {
      id: `node-${crypto.randomUUID().slice(0, 8)}`, name: '补充分析', enabled: true,
      condition: '现有证据不足以回答当前问题时', instructions: '根据证据缺口补充分析，优先自行调用已授权工具。',
      queryConstraints: '仅查询当前系统和已授权环境，使用最小必要范围。',
      outputContract: '返回结论、证据来源及未验证项。', tools: [], mcpServers: [],
    }
    onChange({ nodes: [...current.nodes, node] }); setSelectedId(node.id)
  }
  return <section aria-label="咨询流程配置" className="min-w-0">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold">流程节点</h3>
        <p className="mt-2 max-w-3xl text-xs leading-6 text-slate-600">一个主 Agent 按条件使用这些规则。启用节点的工具合并为会话能力，实际可用范围由目标系统和只读权限决定。</p>
        <p className="text-xs leading-6 text-slate-600">保存候选版本后评测、发布；新咨询生效，已有咨询保留原配置。这里展示配置，不代表节点已执行。</p>
        {!workflow && <p className="mt-2 text-xs text-amber-800">当前版本尚未保存节点配置，正在展示内置基线。</p>}
      </div>
      <button type="button" onClick={add} disabled={current.nodes.length >= 20} className="flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs disabled:opacity-40"><Plus size={14} />添加节点</button>
    </div>
    {!workflow && <button type="button" className="mb-5 text-sm underline underline-offset-4" onClick={() => onChange(current)}>将内置流程加入候选配置</button>}
    <div className="grid min-w-0 gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <ol aria-label="流程顺序" className="divide-y divide-slate-200 border-y border-slate-200">
        {current.nodes.map((node, index) => <li key={node.id}>
          <button type="button" aria-pressed={selected.id === node.id} onClick={() => setSelectedId(node.id)}
            className={`flex w-full gap-3 px-3 py-4 text-left ${selected.id === node.id ? 'bg-slate-100' : 'hover:bg-white'}`}>
            <span className="font-mono text-xs text-slate-500">{String(index + 1).padStart(2, '0')}</span>
            <span className="min-w-0"><span className="block text-sm font-medium">{node.name}</span><span className="mt-1 block text-xs text-slate-600">{node.enabled ? `${node.tools.length} 个工具` : '已停用'}</span></span>
          </button>
        </li>)}
      </ol>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.enabled} onChange={e => update({ ...selected, enabled: e.target.checked })} />启用节点</label>
          <div className="flex gap-2">
            <NodeAction label="上移节点" disabled={current.nodes[0].id === selected.id} onClick={() => move(-1)}><ArrowUp size={16} /></NodeAction>
            <NodeAction label="下移节点" disabled={current.nodes.at(-1)?.id === selected.id} onClick={() => move(1)}><ArrowDown size={16} /></NodeAction>
            <NodeAction label="删除节点" disabled={current.nodes.length === 1} onClick={() => onChange({ nodes: current.nodes.filter(n => n.id !== selected.id) })}><Trash2 size={16} /></NodeAction>
          </div>
        </div>
        <label className="block text-xs font-medium text-slate-700">节点名称<input className={`${control} mt-2`} value={selected.name} maxLength={100} onChange={e => update({ ...selected, name: e.target.value })} /></label>
        <RuleField label="触发条件" value={selected.condition} max={2000} onChange={condition => update({ ...selected, condition })} />
        <RuleField label="执行规则" value={selected.instructions} max={16000} onChange={instructions => update({ ...selected, instructions })} rows={8} />
        <RuleField label="查询约束 · 查什么、怎么查" value={selected.queryConstraints} max={8000} onChange={queryConstraints => update({ ...selected, queryConstraints })} />
        <RuleField label="输出要求" value={selected.outputContract} max={4000} onChange={outputContract => update({ ...selected, outputContract })} />
        <NodeResources node={selected} onChange={update} />
        <NodeCapabilities node={selected} registry={registry} onChange={update} />
      </div>
    </div>
  </section>
}

function RuleField({ label, value, max, rows = 3, onChange }: { label: string; value: string; max: number; rows?: number; onChange: (value: string) => void }) {
  return <label className="block text-xs font-medium text-slate-700">{label}<textarea className={`${control} mt-2 resize-y leading-6`} rows={rows} maxLength={max} value={value} onChange={e => onChange(e.target.value)} /></label>
}

function NodeAction({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded-md border border-slate-300 p-2 hover:bg-white disabled:opacity-30">{children}</button>
}

function NodeCapabilities({ node, registry, onChange }: { node: ConsultWorkflowNode; registry: AgentCapability[]; onChange: (node: ConsultWorkflowNode) => void }) {
  const servers = registry.filter(item => item.type === 'MCP_SERVER')
  const toggleTool = (tool: AgentCapability, checked: boolean) => onChange({ ...node,
    tools: checked ? [...new Set([...node.tools, tool.name])] : node.tools.filter(name => name !== tool.name),
    mcpServers: checked ? [...new Set([...node.mcpServers, tool.source])] : node.mcpServers,
  })
  const toggleServer = (server: string, checked: boolean) => onChange({ ...node,
    mcpServers: checked ? [...new Set([...node.mcpServers, server])] : node.mcpServers.filter(name => name !== server),
    tools: checked ? node.tools : node.tools.filter(name => registry.find(item => item.type === 'TOOL' && item.name === name)?.source !== server),
  })
  return <fieldset className="border-t border-slate-200 pt-5"><legend className="text-sm font-semibold">Tool / MCP 装配</legend>
    <p className="mb-4 text-xs leading-6 text-slate-600">勾选工具自动挂载提供方 MCP。已登记不等于服务在线；数据库工具仅在对应系统获授权时可用。</p>
    {servers.map(server => <div key={server.id} className="border-b border-slate-200 py-4">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={node.mcpServers.includes(server.name)} onChange={e => toggleServer(server.name, e.target.checked)} />{server.name}</label>
      <p className="mt-1 text-xs leading-5 text-slate-600">{server.description}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">{registry.filter(tool => tool.type === 'TOOL' && tool.source === server.name).map(tool =>
        <label key={tool.id} className="flex min-w-0 items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5" checked={node.tools.includes(tool.name)} onChange={e => toggleTool(tool, e.target.checked)} /><span className="min-w-0 break-words"><span className="font-mono">{tool.name}</span><span className="mt-1 block leading-5 text-slate-600">{tool.description}</span></span></label>)}</div>
    </div>)}
  </fieldset>
}
