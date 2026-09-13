import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectRegistryPage } from './ProjectRegistryPage'
import { RegistryProjectDetailPage } from './RegistryProjectDetailPage'
import { listRegistry, getProject, initializeProject } from './api'

vi.mock('./api', () => ({ listRegistry: vi.fn(), getProject: vi.fn(), initializeProject: vi.fn() }))
vi.mock('./ProjectDirectorySettings', () => ({ ProjectDirectorySettings: () => <div>目录设置内容</div> }))
vi.mock('@/features/forge-environment/public-api', () => ({ ProjectEnvironment: () => null }))
vi.mock('./LocalProjectDiscovery', () => ({ LocalProjectDiscovery: () => <div>发现本地目录</div> }))
vi.mock('./ProjectRegistrationForm', () => ({ ProjectRegistrationForm: () => <div>手动登记表单</div> }))
vi.mock('./ProjectAIWorkspace', () => ({ ProjectAIWorkspace: ({ scope }: { scope: { path: string } }) => <div>工作区路径：{scope.path}</div> }))
vi.mock('./SystemDomainsPanel', () => ({ SystemDomainsPanel: () => null }))
vi.mock('./SystemTasksPanel', () => ({ SystemTasksPanel: () => null }))
vi.mock('./SystemProfilePanels', () => ({ AssetPanel: () => null, InitializationProgress: () => null, ProfileOverview: () => null }))
vi.mock('./SystemInitializationGuide', () => ({ SystemInitializationGuide: () => null }))
vi.mock('./diagnostics/ProjectContextDiagnostics', () => ({ ProjectContextDiagnostics: () => null }))
vi.mock('../components/GraphifyGraphModal', () => ({ GraphifyGraphModal: () => null }))

const project = { id: 'forge', metadata: { name: 'Forge', localPath: 'D:/work/forge', repoType: 'git', repoUrl: '', defaultBranch: 'main', devUrl: '', testUrl: '', owner: '' }, state: 'UNINITIALIZED' as const, profileVersion: 0, createdAt: 0, updatedAt: 0 }
function Location() { return <output data-testid="location">{useLocation().pathname}{useLocation().search}</output> }
function mount(url = '/tools/project-workspace') {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[url]}><Location /><Routes><Route path="/tools/project-workspace" element={<ProjectRegistryPage />} /><Route path="/tools/project-workspace/:projectId" element={<RegistryProjectDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>)
}
beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); vi.mocked(listRegistry).mockResolvedValue([project]); vi.mocked(getProject).mockResolvedValue({ project, profile: null, runs: [], tasks: [] }) })
afterEach(cleanup)

it('offers one project list and discovers local directories only when adding', async () => {
  mount()
  await screen.findByRole('link', { name: /Forge/ })
  const nav = within(screen.getByRole('navigation', { name: '项目库区域' }))
  expect(nav.queryByRole('button', { name: '模块工作区' })).not.toBeInTheDocument()
  expect(nav.queryByRole('button', { name: '本地项目' })).not.toBeInTheDocument()
  expect(screen.queryByText('发现本地目录')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '添加项目' }))
  expect(screen.getByText('发现本地目录')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '手动填写项目路径' }))
  expect(screen.getByText('手动登记表单')).toBeInTheDocument()
})

it('opens an uninitialized project directly in its workspace without running init', async () => {
  mount()
  fireEvent.click(await screen.findByRole('link', { name: /Forge/ }))
  expect(await screen.findByText('工作区路径：D:/work/forge')).toBeInTheDocument()
  expect(initializeProject).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '概览' }))
  expect(screen.getByText('系统已登记，等待初始化')).toBeInTheDocument()
})

it('restores the registered identity from a legacy modules link', async () => {
  localStorage.setItem('kai-toolbox:project-workspace:selected-path', 'd:\\work\\FORGE\\')
  mount('/tools/project-workspace?section=modules')
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/tools/project-workspace/forge?tab=workspace'))
})

it('returns unmatched legacy selection to the unified list without registration', async () => {
  localStorage.setItem('kai-toolbox:project-workspace:selected-path', 'D:/other')
  mount('/tools/project-workspace?section=modules')
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/tools/project-workspace'))
  expect(await screen.findByRole('link', { name: /Forge/ })).toBeInTheDocument()
})
