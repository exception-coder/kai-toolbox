import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfigCenterPage } from './ConfigCenterPage'
import { PROJECT_DIRECTORY_BLOCKS } from '../configDestinations'

vi.mock('../api', () => ({
  listConfigBlocks: vi.fn(async () => ({ blocks: [
    { id: 'toolbox.claude-chat.workspace', name: 'Claude 工作目录' },
    { id: 'toolbox.projects', name: '项目管理' },
    { id: 'toolbox.claude-chat.business-workspace', name: '业务系统源码' },
    { id: 'toolbox.llm.gateway', name: 'LLM 网关' },
  ] })),
  getConfigBlock: vi.fn(async () => ({ id: 'toolbox.llm.gateway', name: '网关配置', entries: [] })),
  resetConfigBlock: vi.fn(), updateConfigBlock: vi.fn(),
}))
vi.mock('@/features/ai-chat/public-api', () => ({ fetchModels: vi.fn(async () => ({ models: [] })), HeaderModelPicker: () => null }))

function Target() {
  const location = useLocation()
  return <p>{location.pathname}{location.search} {useNavigationType()}</p>
}
function mount(entry: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[entry]}><Routes>
      <Route path="/tools/config-center" element={<ConfigCenterPage />} />
      <Route path="/tools/project-workspace" element={<Target />} />
    </Routes></MemoryRouter>
  </QueryClientProvider>)
}

describe('directory configuration ownership', () => {
  afterEach(cleanup)
  it.each(Object.values(PROJECT_DIRECTORY_BLOCKS))('redirects legacy %s links with replacement', async id => {
    mount(`/tools/config-center?block=${id}`)
    expect(await screen.findByText('/tools/project-workspace?section=directories REPLACE')).toBeInTheDocument()
  })
  it('keeps other configuration while removing all duplicate directory editors', async () => {
    mount('/tools/config-center')
    expect(await screen.findByRole('button', { name: /LLM 网关/ })).toBeInTheDocument()
    expect(screen.queryByText('Claude 工作目录')).not.toBeInTheDocument()
    expect(screen.queryByText('项目管理')).not.toBeInTheDocument()
    expect(screen.queryByText('业务系统源码')).not.toBeInTheDocument()
  })
})
