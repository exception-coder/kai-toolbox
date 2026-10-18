import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AssistantWorkspace } from './AssistantWorkspace'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { getCatalog, listSessions, getSession, sendMessage, type Session } from '../api'

vi.mock('../api', () => ({ getCatalog: vi.fn(), listSessions: vi.fn(), getSession: vi.fn(), sendMessage: vi.fn(), createSession: vi.fn(), cancelTurn: vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({ Markdown: ({ text }: { text: string }) => <p>{text}</p>, ComposerFileDropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/features/claude-chat/public-api/voice', () => ({ VoiceInputButton: ({ onText }: { onText: (text: string) => void }) => <button onClick={() => onText('语音草稿')}>语音输入</button> }))
vi.mock('./SecureResourceForm', () => ({ SecureResourceForm: () => <div>安全登记</div> }))
const session = (id: string): Session => ({ id, assistantId: 'weekly', title: '本周任务', skillHash: 'hash', engine: 'codex', createdAt: 1, turns: [] })
beforeEach(() => {
  vi.mocked(getCatalog).mockResolvedValue({ assistants: [{ id: 'weekly', name: '周报助理', description: '周报', enabled: true, skill: 'weekly', skillHash: 'hash' }], projects: [] })
  vi.mocked(listSessions).mockResolvedValue([session('a'), session('b')])
  vi.mocked(getSession).mockImplementation(async id => session(id))
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><ConfirmProvider>{children}</ConfirmProvider></QueryClientProvider>

it('voice only fills the retained draft and uncertain submit retries reuse the same request id', async () => {
  vi.mocked(sendMessage).mockRejectedValue(new Error('网络中断，请刷新核对'))
  const memory = { sessionId: 'a', assistantId: 'weekly', drafts: { a: '已有需求' } }
  render(<AssistantWorkspace selection={{ revision: 0 }} memory={memory} />, { wrapper })
  const input = await screen.findByRole('textbox', { name: '给工作助理的消息' })
  fireEvent.click(screen.getByRole('button', { name: '语音输入' }))
  expect(input).toHaveValue('已有需求\n语音草稿')
  expect(sendMessage).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByRole('button', { name: '交给助理' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '交给助理' }))
  await screen.findByText('网络中断，请刷新核对')
  fireEvent.click(screen.getByRole('button', { name: '交给助理' }))
  await waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2))
  expect(vi.mocked(sendMessage).mock.calls[1]).toEqual(vi.mocked(sendMessage).mock.calls[0])
  expect(input).toHaveValue('已有需求\n语音草稿')
})

it('late acknowledgements remain with their original session and preserve the next draft', async () => {
  let resolve!: (value: never) => void
  vi.mocked(sendMessage).mockImplementation(() => new Promise(done => { resolve = done }))
  const memory = { sessionId: 'a', assistantId: 'weekly', drafts: { a: '任务 A', b: '任务 B 草稿' } }
  const view = render(<AssistantWorkspace selection={{ revision: 0 }} memory={memory} />, { wrapper })
  await waitFor(() => expect(screen.getByRole('button', { name: '交给助理' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '交给助理' }))
  view.rerender(<AssistantWorkspace selection={{ assistant: 'weekly', session: 'b', revision: 1 }} memory={memory} />)
  await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('任务 B 草稿'))
  await act(async () => resolve({} as never))
  expect(screen.getByRole('textbox')).toHaveValue('任务 B 草稿')
  expect(memory.drafts.a).toBe('')
  expect(memory.drafts.b).toBe('任务 B 草稿')
})
