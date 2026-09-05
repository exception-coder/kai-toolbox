import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getOpenSpecBoards, getOpenSpecChange } from '../api'
import { OpenSpecBoardPage } from './OpenSpecBoardPage'
import type { OpenSpecBoardList, OpenSpecChangeDetail } from '../types'

vi.mock('../api', () => ({ getOpenSpecBoards: vi.fn(), getOpenSpecChange: vi.fn() }))

const snapshotAt = '2026-09-02T12:00:00Z'
const detail: OpenSpecChangeDetail = {
  projectId: 'project-1', projectName: 'Kai Toolbox', changeId: 'board', title: 'Task Board',
  state: 'ATTENTION', completedTasks: 0, totalTasks: 1,
  artifactPaths: { tasks: ['openspec/changes/board/tasks.md'] },
  tasks: [{ id: '1', outlineId: '1.1', description: 'Resolve blocked task', section: '1', state: 'BLOCKED', runtime: null }],
  affectedApis: [{ sessionId: 'session-12345678', httpMethod: 'POST', apiPath: '/api/orders',
    changeType: 'ADDED', sourceFile: 'src/OrderController.java', handlerName: 'OrderController#create',
    summary: '创建订单', verificationStatus: 'UNVERIFIED', verificationMethod: null,
    verificationSummary: null, updatedAt: snapshotAt }],
  snapshotAt, freshness: 'STALE',
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('OpenSpecBoardPage', () => {
  it('renders project, change, grouped task and stale feedback', async () => {
    vi.mocked(getOpenSpecBoards).mockResolvedValue(boardList())
    vi.mocked(getOpenSpecChange).mockResolvedValue(detail)
    renderPage()

    expect(await screen.findByText('Task Board')).toBeInTheDocument()
    expect(await screen.findAllByText('Resolve blocked task')).not.toHaveLength(0)
    expect(screen.getByText(/快照已过期/)).toBeInTheDocument()
    expect(screen.getByText('/api/orders')).toBeInTheDocument()
    expect(screen.getByText(/1 项待验证/)).toBeInTheDocument()
  })

  it('keeps a failed project visible with a recovery action', async () => {
    vi.mocked(getOpenSpecBoards).mockResolvedValue(boardList())
    vi.mocked(getOpenSpecChange).mockResolvedValue(detail)
    renderPage()
    await screen.findByText('Task Board')

    fireEvent.change(screen.getByLabelText('项目'), { target: { value: 'project-2' } })

    await waitFor(() => expect(screen.getByText('OpenSpec 项目探测失败')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '打开 Forge 环境' })).toHaveAttribute('href', '/tools/forge-environment')
  })

  it('explains when the change has no attributable interface evidence', async () => {
    vi.mocked(getOpenSpecBoards).mockResolvedValue(boardList())
    vi.mocked(getOpenSpecChange).mockResolvedValue({ ...detail, affectedApis: [] })
    renderPage()

    expect(await screen.findByText(/当前 change 尚无可归属的服务端接口证据/)).toBeInTheDocument()
  })
})

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><OpenSpecBoardPage /></QueryClientProvider>)
}

function boardList(): OpenSpecBoardList {
  return {
    snapshotAt,
    projects: [
      {
        id: 'project-1', name: 'Kai Toolbox', state: 'READY', message: 'OpenSpec 已就绪',
        completedTasks: 0, totalTasks: 1, snapshotAt,
        changes: [{ id: 'board', title: 'Task Board', state: 'ATTENTION', completedTasks: 0,
          totalTasks: 1, lastModified: snapshotAt }],
      },
      {
        id: 'project-2', name: 'Unavailable Project', state: 'ERROR', message: 'OpenSpec 项目探测失败',
        completedTasks: 0, totalTasks: 0, snapshotAt, changes: [],
      },
    ],
  }
}
