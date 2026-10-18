import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { createAgentCandidate, getAgent, getWorkflowDefaults, releaseAgentCandidate, type AgentManagementSnapshot, type ConsultWorkflow, type CreateAgentVersionRequest } from '../api'
import { NodeResources } from './NodeResources'

const queryTools = new Set(['consult_web', 'consult_resource_query', 'erp_db_query', 'srm_db_query', 'scm_db_query'])

/** 咨询抽屉中的流程资源编辑器，沿用原候选与发布接口，评测仅供参考。 */
export function ConsultDatabaseSelection() {
  const client = useQueryClient()
  const key = ['agent-management', 'business-consult']
  const agent = useQuery({ queryKey: key, queryFn: () => getAgent('business-consult') })
  const baseline = agent.data?.candidateVersion ?? agent.data?.productionVersion
  const defaults = useQuery({ queryKey: ['agent-management', 'workflow-defaults'], queryFn: getWorkflowDefaults, enabled: !!baseline && !baseline.workflow })
  const [draft, setDraft] = useState<ConsultWorkflow | null>(null)
  // 编辑期间冻结完整基线，后台刷新不得把别人的模型/提示词变更混入本次草稿。
  const [base, setBase] = useState<typeof baseline>(undefined)
  const workflow = draft ?? baseline?.workflow ?? defaults.data
  const accept = (value: AgentManagementSnapshot) => {
    client.setQueryData(key, value); setDraft(null); setBase(undefined)
    void client.invalidateQueries({ queryKey: ['consult-database-configuration'] })
  }
  const save = useMutation({ mutationFn: async (value: CreateAgentVersionRequest) => {
    const latest = await getAgent('business-consult')
    if (JSON.stringify(latest.candidateVersion ?? latest.productionVersion) !== JSON.stringify(base)) {
      client.setQueryData(key, latest)
      throw new Error('流程已更新，请刷新后重新修改')
    }
    return createAgentCandidate('business-consult', value)
  }, onSuccess: accept })
  const release = useMutation({ mutationFn: (version: number) => releaseAgentCandidate('business-consult', version), onSuccess: accept })
  const busy = save.isPending || release.isPending
  const conflict = !!draft && !!base && baseline?.version !== base.version
  const submit = () => {
    if (!draft || !base || conflict) return
    const enabled = draft.nodes.filter(node => node.enabled)
    save.mutate({ model: base.model, temperature: base.temperature, promptRef: base.promptRef, orchestrationVersion: base.orchestrationVersion,
      skills: base.skills, workflow: draft, tools: [...new Set(enabled.flatMap(node => node.tools))], mcpServers: [...new Set(enabled.flatMap(node => node.mcpServers))],
      evaluationRunId: null, evaluationScore: null, evaluationPassed: false })
  }
  const nodes = workflow?.nodes.filter(node => node.tools.some(tool => queryTools.has(tool)) || !!node.resourceBindingIds?.length) ?? []
  return <div className="space-y-3 text-sm">
    <p className="text-xs leading-5 text-muted-foreground">可同时勾选数据库与不同环境的Web账号。流程是全局配置；实际访问仍仅允许当前咨询系统的已启用绑定。修改仅保存候选，发布后对新咨询生效；开发迭代期间无需先评测。</p>
    <Button variant="ghost" disabled={busy || agent.isFetching} onClick={() => { void agent.refetch(); if (!baseline?.workflow) void defaults.refetch() }}>刷新流程</Button>
    {(agent.isPending || defaults.isFetching) && <p role="status">正在读取咨询流程…</p>}
    {(agent.isError || defaults.isError) && <p role="alert" className="text-xs text-destructive">流程读取失败，原选择及草稿保留，请刷新重试。</p>}
    {agent.data && <p className="text-xs text-muted-foreground">已发布：{agent.data.productionVersion ? `v${agent.data.productionVersion.version}` : '无'} · 候选：{agent.data.candidateVersion ? `v${agent.data.candidateVersion.version}（未发布）` : '无'}</p>}
    {agent.data?.candidateVersion && <p className="text-xs text-muted-foreground">评测：{!agent.data.candidateVersion.evaluationRunId ? '未评测' : agent.data.candidateVersion.evaluationPassed ? '已通过' : '未通过'}{agent.data.candidateVersion.evaluationScore != null && ` · ${agent.data.candidateVersion.evaluationScore}分`}；仅供参考，不限制发布。</p>}
    <fieldset disabled={busy || !agent.isSuccess} className="min-w-0 space-y-3">
      {nodes.map(node => <section key={node.id} className="min-w-0 space-y-2">
        <h4 className="break-words text-xs font-medium">{node.name}{!node.enabled && ' · 节点未启用，选用不会执行查询'}</h4>
        <NodeResources node={node} onChange={next => {
          if (!workflow || !baseline) return
          if (!draft) setBase(baseline)
          setDraft({ ...workflow, nodes: workflow.nodes.map(item => item.id === next.id ? next : item) }); save.reset(); release.reset()
        }} />
      </section>)}
      {workflow && !nodes.length && <p className="text-xs">当前流程没有数据库查询节点，请在 Agent 管理中添加。</p>}
      {conflict && <p role="alert" className="text-xs text-destructive">候选版本已被其他操作更新，当前草稿仍保留。请放弃草稿并刷新后重新修改。</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!draft || conflict || !agent.isSuccess} onClick={submit}>保存资源选择为候选</Button>
        {draft && <Button variant="ghost" onClick={() => { setDraft(null); setBase(undefined); save.reset() }}>放弃选择修改</Button>}
        <Button disabled={!!draft || !agent.isSuccess || !agent.data?.candidateVersion || !agent.data.releaseGate.releasable} onClick={() => {
          if (agent.data?.candidateVersion && agent.data.releaseGate.releasable) release.mutate(agent.data.candidateVersion.version)
        }}>发布候选</Button>
      </div>
    </fieldset>
    {(save.isError || release.isError) && <p role="alert" className="text-xs text-destructive">{save.isError ? '候选保存失败，草稿已保留。' : '发布失败。'}请刷新核对实际版本后重试。</p>}
    {save.isSuccess && !release.isSuccess && <p role="status" className="text-xs">资源选择已保存为候选，尚未生效。资源变更已清除旧评测结果，可直接发布后验证。</p>}
    {release.isSuccess && <p role="status" className="text-xs">候选已发布，对新咨询生效；已有咨询保留原资源选择。</p>}
    {agent.data?.candidateVersion && !draft && !agent.data.releaseGate.releasable && <p className="text-xs text-muted-foreground">暂不可发布：{agent.data.releaseGate.reason}</p>}
    <a className="inline-flex min-h-11 items-center text-xs underline" href="/tools/agent-management?agent=business-consult" target="_blank" rel="noreferrer">评测 / 编辑完整流程 ↗</a>
  </div>
}
