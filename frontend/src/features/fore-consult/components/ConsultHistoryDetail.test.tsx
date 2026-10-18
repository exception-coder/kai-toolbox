import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { ConsultSessionView } from '../api'
import { ConsultHistoryDetail } from './ConsultHistoryDetail'

const calls = vi.hoisted(() => ({ detail: vi.fn(), resume: vi.fn(), close: vi.fn() }))
vi.mock('../api', () => ({ getConsult: calls.detail }))
vi.mock('./ConsultDocuments', () => ({ ConsultDocuments: () => null }))
vi.mock('./ConsultPanel', () => ({
  ConsultPanel: ({ children }: { children: (controls: null) => React.ReactNode }) => <section>{children(null)}</section>,
  ConsultAnswerContent: ({ children }: { children: React.ReactNode }) => children,
}))
const pending: ConsultSessionView = {
  sessionId: 'unlinked', devSessionId: null, archiveStatus: 'PENDING',
  systemName: 'ERP', systemSourcePath: 'D:/erp', moduleNames: [], role: 'BIZ',
  questionTitle: '原问题', userId: '1', creatorName: null, evidenceSystems: [],
  evidenceRouteSnapshot: null, promptSnapshot: null, rawReferenceJson: null,
  parseStatus: 'PENDING', engine: 'codex', model: null, codexReasoningEffort: null,
  codexSpeed: null, codexHome: null, orchestrationVersion: 'v4', errorMsg: null,
  createdAt: 1, endedAt: null, turnCount: 0, turns: [], feedback: [],
}
let client: QueryClient
beforeEach(() => {
  vi.useFakeTimers()
  calls.detail.mockReset().mockResolvedValue(pending)
  calls.resume.mockReset(); calls.close.mockReset()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})
afterEach(() => { cleanup(); client.clear(); vi.useRealTimers() })
const advance = async (milliseconds: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) }) }
async function mount() {
  render(<QueryClientProvider client={client}><ConsultHistoryDetail embedded sessionId="unlinked" title="原问题" onClose={calls.close} onResume={calls.resume} /></QueryClientProvider>)
  await advance(1)
}

it('ends waiting for an unlinked zero-turn consultation and allows a bounded retry', async () => {
  await mount()
  expect(screen.getByText('正在连接原会话…')).toBeVisible()
  expect(screen.getByText(/暂时没有保存的问答/)).toBeVisible()
  await advance(30001)
  expect(screen.queryByText('正在连接原会话…')).not.toBeInTheDocument()
  expect(screen.getByText(/已停止自动连接/)).toBeVisible()
  const count = calls.detail.mock.calls.length
  await advance(10000)
  expect(calls.detail).toHaveBeenCalledTimes(count)
  fireEvent.click(screen.getByRole('button', { name: '重新检查连接' }))
  await advance(1)
  expect(screen.getByText('正在连接原会话…')).toBeVisible()
  await advance(30001)
  expect(screen.getByText(/已停止自动连接/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '返回历史咨询' }))
  expect(calls.close).toHaveBeenCalledOnce()
  expect(calls.resume).not.toHaveBeenCalled()
})

it('keeps saved questions and answers visible while waiting and after timeout', async () => {
  calls.detail.mockResolvedValue({ ...pending, rawReferenceJson: JSON.stringify([
    { kind: 'user', text: '保留的原问题' }, { kind: 'assistant', text: '保留的回答' },
  ]) })
  await mount()
  expect(screen.getByText('保留的原问题')).toBeVisible()
  expect(screen.getByText('保留的回答')).toBeVisible()
  await advance(30001)
  expect(screen.getByText('保留的回答')).toBeVisible()
})

it('automatically resumes once a zero-turn record receives its original runtime binding', async () => {
  await mount()
  const linked = { ...pending, devSessionId: 'original-runtime' }
  calls.detail.mockResolvedValue(linked)
  await advance(2001)
  expect(calls.resume).toHaveBeenCalledExactlyOnceWith(linked)
  expect(screen.queryByText('正在连接原会话…')).not.toBeInTheDocument()
})


it('keeps saved content readable when a later connection check fails', async () => {
  calls.detail.mockResolvedValue({ ...pending, rawReferenceJson: JSON.stringify([
    { kind: 'user', text: '保留的原问题' }, { kind: 'assistant', text: '保留的回答' },
  ]) })
  await mount()
  calls.detail.mockRejectedValue(new Error('offline'))
  await advance(2001)
  expect(screen.getByRole('alert')).toHaveTextContent('已保存的内容仍可阅读')
  expect(screen.getByText('保留的回答')).toBeVisible()
  expect(screen.getByRole('button', { name: '重试检查' })).toBeEnabled()
})
