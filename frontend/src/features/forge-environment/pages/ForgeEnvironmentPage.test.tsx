import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ForgeEnvironmentPage } from './ForgeEnvironmentPage'
import { getForgeEnvironment } from '../api'
import type { ForgeEnvironmentSnapshot } from '../types'

vi.mock('../api', () => ({
  getForgeEnvironment: vi.fn(), getBusinessSystemWorkspaces: vi.fn().mockResolvedValue([]),
  forgeEnvironmentBootstrapPath: vi.fn(), businessOpenSpecInitPath: vi.fn(), businessSourceSyncPath: vi.fn(),
  teamSuiteInstallPath: vi.fn(), teamSuiteUpdatePath: vi.fn(),
}))
vi.mock('../components/ReadinessSummary', () => ({ ReadinessSummary: ({ snapshot }: { snapshot: ForgeEnvironmentSnapshot }) => <p>结果 {snapshot.measurement?.engine}</p> }))
vi.mock('../components/SuiteOperations', () => ({ SuiteOperations: () => null }))
vi.mock('../components/BusinessSourceOperations', () => ({ BusinessSourceOperations: () => null }))
vi.mock('../components/BootstrapProgress', () => ({ BootstrapProgress: () => null }))
afterEach(() => { cleanup(); vi.clearAllMocks() })

function snapshot(engine: 'java' | 'go'): ForgeEnvironmentSnapshot {
  return { state: 'READY', ready: true, readyCount: 0, totalCount: 0, blockingCount: 0,
    checkedAt: '2026-09-13T00:00:00Z', groups: [], measurement: { engine, totalMs: 10, probesMs: 5, commands: [] } }
}

it('isolates an old Java response after selecting Go while loading', async () => {
  let resolveJava!: (value: ForgeEnvironmentSnapshot) => void
  vi.mocked(getForgeEnvironment).mockImplementation((_fetch, engine) => engine === 'go'
    ? Promise.resolve(snapshot('go')) : new Promise((resolve) => { resolveJava = resolve }))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><ForgeEnvironmentPage embedded /></QueryClientProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Go' }))
  expect(await screen.findByText('结果 go')).toBeInTheDocument()
  await act(async () => resolveJava(snapshot('java')))
  expect(screen.getByText('结果 go')).toBeInTheDocument()
  expect(client.getQueryData(['forge-environment', 'java'])).toEqual(snapshot('java'))
  expect(client.getQueryData(['forge-environment', 'go'])).toEqual(snapshot('go'))
  client.clear()
})

it('keeps the selector available after Go fails', async () => {
  vi.mocked(getForgeEnvironment).mockImplementation((_fetch, engine) => engine === 'go'
    ? Promise.reject(new Error('Go 检测器未构建')) : Promise.resolve(snapshot('java')))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><ForgeEnvironmentPage embedded /></QueryClientProvider>)
  await screen.findByText('结果 java')
  fireEvent.click(screen.getByRole('button', { name: 'Go' }))
  await screen.findByText('Go 检测器未构建')
  fireEvent.click(screen.getByRole('button', { name: 'Java' }))
  expect(await screen.findByText('结果 java')).toBeInTheDocument()
  client.clear()
})
