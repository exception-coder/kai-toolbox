import { cleanup, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ProjectKnowledgeEntry } from './ProjectKnowledgeEntry'
import { listRegistry } from '../registry/api'

vi.mock('../registry/api', () => ({ listRegistry: vi.fn() }))
vi.mock('../registry/SystemDomainsPanel', () => ({ SystemDomainsPanel: ({ projectId }: { projectId: string }) => <p>绑定：{projectId}</p> }))
afterEach(cleanup)
beforeEach(() => vi.clearAllMocks())
function show(path: string) {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProjectKnowledgeEntry projectPath={path} /></QueryClientProvider>)
}
it('matches Windows directory identity rather than project name', async () => {
  vi.mocked(listRegistry).mockResolvedValue([{ id: 'system-id', metadata: { name: 'different-name', localPath: 'D:\\WORK\\ERP', repoType: 'local', repoUrl: '', defaultBranch: '', devUrl: '', testUrl: '', owner: '' }, state: 'AI_READY', profileVersion: 1, createdAt: 1, updatedAt: 1 }])
  show('d:/work/erp/')
  expect(await screen.findByText('绑定：system-id')).toBeInTheDocument()
})
it('offers recovery for unregistered directories without creating duplicate configuration', async () => {
  vi.mocked(listRegistry).mockResolvedValue([])
  show('D:/unknown')
  expect(await screen.findByRole('link', { name: '接入项目库' })).toHaveAttribute('href', '/tools/project-workspace?section=local')
})
it('reports registry failure instead of treating it as unregistered', async () => {
  vi.mocked(listRegistry).mockRejectedValue(new Error('登记服务不可用'))
  show('D:/unknown')
  expect(await screen.findByText('登记服务不可用')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: '接入项目库' })).not.toBeInTheDocument()
})
