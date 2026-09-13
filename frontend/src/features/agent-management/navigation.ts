import { useSearchParams } from 'react-router-dom'

export const AGENT_MANAGEMENT_PATH = '/tools/agent-management'
export type AgentDetailTab = 'overview' | 'capabilities' | 'evaluation' | 'versions'

export function evaluationHref(agentId?: string, dataset?: string) {
  const params = new URLSearchParams({ section: 'evaluation' })
  if (agentId) params.set('agent', agentId)
  if (dataset) params.set('dataset', dataset)
  return `${AGENT_MANAGEMENT_PATH}?${params}`
}

export function agentDetailHref(agentId: string) {
  return `${AGENT_MANAGEMENT_PATH}?${new URLSearchParams({ agent: agentId, tab: 'evaluation' })}`
}

export function useAgentNavigation() {
  const [params, setParams] = useSearchParams()
  const requestedTab = params.get('tab')
  const tab: AgentDetailTab = requestedTab === 'capabilities' || requestedTab === 'evaluation'
    || requestedTab === 'versions' ? requestedTab : 'overview'
  const update = (values: Record<string, string>) => setParams(previous => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(values)) next.set(key, value)
    return next
  })
  return {
    agentId: params.get('agent') || 'business-consult',
    tab,
    selectAgent: (agent: string) => update({ agent, tab: 'overview' }),
    selectTab: (nextTab: AgentDetailTab) => update({ tab: nextTab }),
  }
}
