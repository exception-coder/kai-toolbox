import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { UseClaudeChatSocket } from '@/features/claude-chat/public-api'
import { ConsultConversation, type ConsultConversationDraft } from './ConsultConversation'

const mocks = vi.hoisted(() => ({ phase: 'running', dispatch: vi.fn(), registerBug: vi.fn() }))
vi.mock('@/features/claude-chat/public-api', () => ({
  Markdown: ({ text }: { text: string }) => <span>{text}</span>, uploadAttachment: vi.fn(),
}))
vi.mock('../api', () => ({
  dispatchConsultQuestion: mocks.dispatch, classifyConsultQuestion: vi.fn(async () => ({ classification: 'FOLLOW_UP' })),
  registerBug: mocks.registerBug, submitFeedback: vi.fn(),
}))
vi.mock('../consultConversationState', () => ({
  useConsultConversationRuntimeState: () => ({
    state: { phase: mocks.phase }, runtimeState: { effectiveStatus: 'IDLE' }, refetchRuntime: vi.fn(),
  }),
}))
vi.mock('./ConsultDocuments', () => ({ ConsultDocuments: () => null }))
vi.mock('./ConsultRoutingStatus', () => ({ ConsultRoutingStatus: () => null }))
vi.mock('./ConsultVoiceActions', () => ({ ConsultVoiceActions: () => null }))
vi.mock('./ConsultPanel', () => ({
  ConsultPanel: ({ children }: { children: (controls: null) => React.ReactNode }) => <div>{children(null)}</div>,
  ConsultAnswerContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

beforeEach(() => { HTMLElement.prototype.scrollTo = vi.fn() })
afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.phase = 'running' })

function setup() {
  const chat = {
    state: 'ready', sessionId: 'dev-1', running: true, items: [], send: vi.fn(),
    interrupt: vi.fn(), clearQueued: vi.fn(), currentEngine: 'codex',
  } as unknown as UseClaudeChatSocket
  const props = { chat, consultId: 'consult-1', systemLabel: 'ERP', roleLabel: '业务员',
    onClose: vi.fn(), onArchive: vi.fn(), onStartNew: vi.fn(), archiving: false }
  return { chat, props }
}

it('reads the original archived messages without exposing follow-up, archive or bug writes', () => {
  const { props, chat } = setup()
  chat.running = false
  chat.historyError = '原会话记录无法访问'
  mocks.phase = 'idle'
  chat.items = [{ id: 'q1', kind: 'user', text: '原问题', ts: 1 },
    { id: 'a1', kind: 'assistant', text: '原会话完整回答\n<<<BUG_REPORT>>>\n{"title":"历史缺陷"}\n<<<END_BUG_REPORT>>>', ts: 2 }]
  const onViewArchive = vi.fn()
  render(<ConsultConversation {...props} readOnly embedded onViewArchive={onViewArchive} />)
  expect(screen.getByText('原问题')).toBeVisible()
  expect(screen.getByText('原会话完整回答')).toBeVisible()
  expect(screen.getByText(/已归档 · 仅供阅读/)).toBeVisible()
  expect(screen.queryByRole('button', { name: '结束归档' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑咨询' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '引用' })).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '复制' })).toHaveLength(2)
  expect(mocks.registerBug).not.toHaveBeenCalled()
  expect(chat.send).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '查看归档副本' }))
  expect(onViewArchive).toHaveBeenCalledOnce()
})

it('keeps follow-up drafts separate when switching to a new consultation and back', () => {
  const { props } = setup()
  const draftCache = new Map<string, ConsultConversationDraft>()
  const { rerender } = render(<ConsultConversation key="first" {...props} draftCache={draftCache} />)
  fireEvent.change(screen.getByRole('textbox', { name: '追问草稿' }), { target: { value: '原咨询的待发追问' } })
  rerender(<ConsultConversation key="second" {...props} consultId="consult-2" draftCache={draftCache} />)
  expect(screen.getByRole('textbox', { name: '追问草稿' })).toHaveValue('')
  fireEvent.change(screen.getByRole('textbox', { name: '追问草稿' }), { target: { value: '新咨询的追问' } })
  rerender(<ConsultConversation key="first" {...props} draftCache={draftCache} />)
  expect(screen.getByRole('textbox', { name: '追问草稿' })).toHaveValue('原咨询的待发追问')
  expect(draftCache.get('consult-2')?.text).toBe('新咨询的追问')
})

it('allows drafting and attachments during an answer, blocks sending, and keeps the draft when it finishes', () => {
  const { chat, props } = setup()
  const { rerender } = render(<ConsultConversation {...props} />)
  const draft = screen.getByRole('textbox', { name: '追问草稿' })
  expect(draft).toBeEnabled()
  expect(draft.className).not.toContain('cursor-wait')
  expect(screen.getByRole('button', { name: '附件' })).toBeEnabled()
  fireEvent.change(draft, { target: { value: '下一步请比较 SRM 的日期' } })
  fireEvent.keyDown(draft, { key: 'Enter', shiftKey: true })
  expect(chat.send).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '处理中' })).toBeDisabled()
  mocks.phase = 'idle'
  chat.running = false
  rerender(<ConsultConversation {...props} />)
  expect(draft).toHaveValue('下一步请比较 SRM 的日期')
  expect(screen.getByRole('button', { name: '发送' })).toBeEnabled()
  expect(chat.send).not.toHaveBeenCalled()
})

it('preserves edits made while a follow-up is being dispatched', async () => {
  const { chat, props } = setup()
  chat.running = false
  chat.items = [{ id: 'q1', kind: 'user', text: '首问', ts: 1 }]
  mocks.phase = 'idle'
  let resolveDispatch!: (value: { prompt: string }) => void
  mocks.dispatch.mockImplementationOnce(() => new Promise(resolve => { resolveDispatch = resolve }))
  render(<ConsultConversation {...props} />)
  const draft = screen.getByRole('textbox', { name: '追问草稿' })
  fireEvent.change(draft, { target: { value: '本次追问' } })
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  fireEvent.change(draft, { target: { value: '准备下一条问题' } })
  await act(async () => { resolveDispatch({ prompt: '服务端调度' }) })
  expect(chat.send).toHaveBeenCalledWith('本次追问', undefined, undefined, '服务端调度')
  expect(draft).toHaveValue('准备下一条问题')
})

it('uses an inline themed composer in a desktop embedded panel without opening a mobile editor', () => {
  const { props } = setup()
  render(<ConsultConversation {...props} embedded compactComposer={false} />)
  const input = screen.getByRole('textbox', { name: '追问草稿' })
  fireEvent.change(input, { target: { value: '在面板内继续输入' } })
  expect(input).toHaveValue('在面板内继续输入')
  expect(input.closest('.fc-desktop-composer')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '编辑咨询' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
