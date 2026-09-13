import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { WorkflowEditor } from './WorkflowEditor'
import type { AgentCapability, ConsultWorkflow } from '../api'

const registry: AgentCapability[] = [
  { id: 'mcp:consult-readonly', name: 'consult-readonly', type: 'MCP_SERVER', version: 'v1', source: 'platform', description: '只读工具', permission: 'READ_ONLY', riskLevel: 'LOW', availability: 'REGISTERED', availabilityBasis: '未探活', providedCapabilityIds: [] },
  { id: 'tool:source_read', name: 'source_read', type: 'TOOL', version: 'v1', source: 'consult-readonly', description: '读取源码', permission: 'READ_ONLY', riskLevel: 'LOW', availability: 'REGISTERED', availabilityBasis: '未探活', providedCapabilityIds: [] },
]
const initial: ConsultWorkflow = { nodes: [
  { id: 'first', name: '定位问题', enabled: true, condition: '开始时', instructions: '理解问题', queryConstraints: '只读', outputContract: '证据', tools: [], mcpServers: [] },
  { id: 'second', name: '输出答案', enabled: true, condition: '证据充分', instructions: '回答问题', queryConstraints: '只读', outputContract: '答案', tools: [], mcpServers: [] },
] }

function Harness() {
  const [workflow, setWorkflow] = useState(initial)
  return <QueryClientProvider client={new QueryClient()}><WorkflowEditor workflow={workflow} registry={registry} onChange={setWorkflow} /><output data-testid="saved">{JSON.stringify(workflow)}</output></QueryClientProvider>
}

describe('WorkflowEditor', () => {
  it('edits rules, assembles provider automatically and preserves node while reordering', () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('执行规则'), { target: { value: '需要数据库证据时直接查询' } })
    fireEvent.click(screen.getByLabelText(/source_read/))
    fireEvent.click(screen.getByLabelText('下移节点'))
    const saved = JSON.parse(screen.getByTestId('saved').textContent!) as ConsultWorkflow
    expect(saved.nodes[1].instructions).toBe('需要数据库证据时直接查询')
    expect(saved.nodes[1].mcpServers).toEqual(['consult-readonly'])
    expect(saved.nodes[1].tools).toEqual(['source_read'])
    expect(screen.getByLabelText('节点名称')).toHaveValue('定位问题')
    fireEvent.click(screen.getByLabelText('consult-readonly', { exact: true }))
    expect(JSON.parse(screen.getByTestId('saved').textContent!).nodes[1].tools).toEqual([])
  })
})
