import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NodeResources } from './NodeResources'
import type { ConsultWorkflowNode } from '../api'

vi.mock('../api', () => ({ getConsultResources: vi.fn().mockResolvedValue([
  { bindingId: 'bound', systemId: 'one', systemName: 'ERP', name: '测试库', environment: 'TEST', purpose: '订单查询', state: 'AVAILABLE' },
  { bindingId: 'prod', systemId: 'one', systemName: 'ERP', name: '生产库', environment: 'PROD', purpose: '', state: 'RESTRICTED' },
]) }))
function Harness() {
  const [node, setNode] = useState<ConsultWorkflowNode>({ id: 'db', name: '查询', enabled: true,
    condition: '需要数据', instructions: '查询', queryConstraints: '只读', outputContract: '证据',
    tools: ['erp_db_query'], mcpServers: ['consult-readonly'], resourceBindingIds: ['missing'] })
  return <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <NodeResources node={node} onChange={setNode} /><output data-testid="selection">{JSON.stringify(node)}</output>
  </QueryClientProvider>
}
describe('NodeResources', () => {
  it('selects a resource, assembles readonly tools and preserves missing references for explicit removal', async () => {
    render(<Harness />)
    fireEvent.click(await screen.findByLabelText(/ERP · 测试库/))
    let node = JSON.parse(screen.getByTestId('selection').textContent!)
    expect(node.resourceBindingIds).toEqual(['missing', 'bound'])
    expect(node.tools).toEqual(['consult_resources', 'consult_resource_query'])
    expect(screen.getByLabelText(/ERP · 生产库/)).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/已失效的资源绑定/))
    node = JSON.parse(screen.getByTestId('selection').textContent!)
    expect(node.resourceBindingIds).toEqual(['bound'])
    expect(screen.getByRole('link', { name: /配置系统资源/ })).toHaveAttribute('target', '_blank')
  })
})
