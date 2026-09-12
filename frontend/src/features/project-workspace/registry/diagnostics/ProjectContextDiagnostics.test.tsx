import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { ProjectContextDiagnostics } from './ProjectContextDiagnostics'
import { LegacyRouteRedirect } from './LegacyRouteRedirect'
import { matchingProject, sameSourcePath } from './projectContext'
import * as api from './api'

vi.mock('./api')
const candidate = { projectKey: 'yoooni', displayName: 'Yoooni', projectPath: 'D:/source/yoooni', source: 'test', sourceAvailable: true, knowledgeAvailable: true }
function show(scope?: { name: string; path: string }) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ProjectContextDiagnostics scope={scope} /></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => {
  vi.mocked(api.listSystemRouteCandidates).mockResolvedValue([candidate])
  vi.mocked(api.listProjectRouteBindings).mockResolvedValue([])
  vi.mocked(api.listWorkspaceProjectPaths).mockResolvedValue([])
})
afterEach(() => { cleanup(); vi.resetAllMocks() })

describe('project context diagnostics', () => {
  it('matches Windows source paths but preserves Unix case sensitivity', () => {
    expect(sameSourcePath('D:\\Source\\Yoooni\\', 'd:/source/yoooni')).toBe(true)
    expect(sameSourcePath('/source/App', '/source/app')).toBe(false)
    expect(matchingProject([candidate], { name: 'Yoooni', path: '/different' })).toBe('')
  })
  it('selects the current source and preserves inputs when inspection fails', async () => {
    vi.mocked(api.inspectSystemRoute).mockRejectedValue(new Error('诊断服务暂不可用'))
    show({ name: 'Yoooni', path: 'd:/source/yoooni' })
    const button = await screen.findByRole('button', { name: '执行上下文诊断' })
    await waitFor(() => expect(button).toBeEnabled())
    fireEvent.change(screen.getByLabelText('模块名称（可选）'), { target: { value: '采购订单' } })
    fireEvent.click(button)
    await screen.findByText('诊断服务暂不可用')
    expect(api.inspectSystemRoute).toHaveBeenCalledWith({ project: 'yoooni', module: '采购订单', url: '' })
    expect(screen.getByLabelText('模块名称（可选）')).toHaveValue('采购订单')
  })
  it('blocks mismatched sources and offers the current path for binding', async () => {
    show({ name: 'Other', path: '/source/other' })
    const button = await screen.findByRole('button', { name: '执行上下文诊断' })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('知识项目'), { target: { value: 'yoooni' } })
    expect(button).toBeDisabled()
    expect(screen.getByLabelText('源码根目录')).toHaveValue('/source/other')
    expect(api.inspectSystemRoute).not.toHaveBeenCalled()
  })
  it('does not show a previous result after diagnostic inputs change', async () => {
    vi.mocked(api.inspectSystemRoute).mockResolvedValue({ overallStatus: 'DEGRADED', summary: '当前输入的诊断证据', route: null,
      runtimeTools: { status: 'UNAVAILABLE', targetSystems: [], tools: [], protocolVersion: null }, menuTools: [], checks: [] })
    show({ name: 'Yoooni', path: candidate.projectPath })
    const button = await screen.findByRole('button', { name: '执行上下文诊断' })
    fireEvent.click(button)
    await screen.findByText('当前输入的诊断证据')
    fireEvent.change(screen.getByLabelText('页面 URL（可选）'), { target: { value: '/different' } })
    expect(screen.queryByText('当前输入的诊断证据')).not.toBeInTheDocument()
  })
  it('preserves legacy diagnostic query parameters during redirect', async () => {
    function Destination() { return <output>{useLocation().search}</output> }
    render(<MemoryRouter initialEntries={['/tools/system-route-inspector?project=yoooni&module=order&url=%2Forders']}><Routes><Route path='/tools/system-route-inspector' element={<LegacyRouteRedirect />} /><Route path='/tools/project-workspace' element={<Destination />} /></Routes></MemoryRouter>)
    expect(await screen.findByText('?project=yoooni&module=order&url=%2Forders&section=diagnostics')).toBeInTheDocument()
  })
})
