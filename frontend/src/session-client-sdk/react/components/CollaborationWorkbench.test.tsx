import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CollaborationWorkbench } from './ForgeRelayPanel'
import type { CollaborationAdapter } from '../contracts'
afterEach(cleanup)

const fixture = vi.hoisted(() => ({
  session: { sessionId: 'sample-session', title: '样衣试点', expiresAt: '2099-01-01T00:00:00Z' },
  connect: vi.fn(), destroy: vi.fn(), send: vi.fn(), pair: vi.fn(), sessionRead: vi.fn(),
  stateListener: undefined as undefined | ((state: string) => void),
  eventListener: undefined as undefined | ((event: unknown) => void),
  upload: vi.fn(), answer: vi.fn(),
}))
const adapter = {
  readSession: fixture.sessionRead,
  pair: fixture.pair,
  createClient: () => ({
    connect: fixture.connect, destroy: fixture.destroy, send: fixture.send, upload: fixture.upload, answerQuestion: fixture.answer,
    loadHistory: async () => ({ items: [], transcriptMissing: false }),
    subscribe: (listener: (event: unknown) => void) => { fixture.eventListener = listener; return () => {} },
    subscribeState: (listener: (state: string) => void) => { fixture.stateListener = listener; return () => {} },
  }),
} as unknown as CollaborationAdapter

const context = { systemName: "采购系统", moduleName: "询价管理" }

beforeEach(() => {
  vi.clearAllMocks()
  fixture.sessionRead.mockResolvedValue(fixture.session)
  fixture.pair.mockResolvedValue(fixture.session)
  fixture.send.mockResolvedValue('command-1')
  fixture.upload.mockResolvedValue({ id: 'attachment-1', name: '说明.txt', mime: 'text/plain', size: 4 })
  fixture.answer.mockResolvedValue('answer-1')
  fixture.connect.mockImplementation(async () => { fixture.stateListener?.('connected'); return fixture.session })
})

it('sends a requirement and destroys the connection on close', async () => {
  const view = render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByText('样衣试点 · 已连接')
  fireEvent.change(screen.getByLabelText('业务需求'), { target: { value: '增加拍摄时间筛选' } })
  fireEvent.click(screen.getByRole('button', { name: '发送需求' }))
  await waitFor(() => expect(fixture.send).toHaveBeenCalledWith({ text: expect.stringContaining('增加拍摄时间筛选'), attachments: undefined }))
  await waitFor(() => expect(screen.getByLabelText('业务需求')).toHaveValue(''))
  view.unmount()
  expect(fixture.destroy).toHaveBeenCalled()
})

it('offers pairing when no binding exists and does not send identity in the invitation', async () => {
  fixture.sessionRead.mockRejectedValue(new Error('当前用户尚未绑定 Forge 会话'))
  render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByRole('alert')
  fireEvent.change(screen.getByLabelText('一次性邀请码'), { target: { value: 'one-time-code' } })
  fireEvent.click(screen.getByRole('button', { name: '配对并连接' }))
  await screen.findByText('样衣试点 · 已连接')
  expect(fixture.pair).toHaveBeenCalledWith('one-time-code')
})

it('does not create a connection after an in-flight session read finishes on an unmounted panel', async () => {
  let resolve!: (value: unknown) => void
  fixture.sessionRead.mockReturnValue(new Promise(done => { resolve = done }))
  const view = render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  view.unmount()
  resolve(fixture.session)
  await Promise.resolve()
  expect(fixture.connect).not.toHaveBeenCalled()
})

it('uploads attachments before sending their public references', async () => {
  render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByText('样衣试点 · 已连接')
  const file = new File(['说明'], '说明.txt', { type: 'text/plain' })
  fireEvent.change(screen.getByLabelText('附件（可选）'), { target: { files: [file] } })
  fireEvent.change(screen.getByLabelText('业务需求'), { target: { value: '参考附件' } })
  fireEvent.click(screen.getByRole('button', { name: '发送需求' }))
  await waitFor(() => expect(fixture.upload).toHaveBeenCalledWith(file))
  await waitFor(() => expect(fixture.send).toHaveBeenCalledWith(expect.objectContaining({
    attachments: [expect.objectContaining({ id: 'attachment-1' })],
  })))
})

it('submits answers keyed by the public question text', async () => {
  render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByText('样衣试点 · 已连接')
  act(() => fixture.eventListener?.({ type: 'businessQuestion', data: {
    requestId: 'question-1', questions: [{ question: '筛选范围？', options: [], multiSelect: false }],
  } }))
  fireEvent.change(screen.getByLabelText('筛选范围？'), { target: { value: '最近一个月' } })
  fireEvent.click(screen.getByRole('button', { name: '提交回答' }))
  await waitFor(() => expect(fixture.answer).toHaveBeenCalledWith('question-1', { '筛选范围？': '最近一个月' }))
})

it('destroys the client and disables sending after grant revocation', async () => {
  render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByText('样衣试点 · 已连接')
  act(() => fixture.eventListener?.({ type: 'error', error: { code: 'GRANT_REVOKED', message: '授权已撤销', retryable: false } }))
  expect(fixture.destroy).toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '发送需求' })).toBeDisabled()
  expect(screen.getByText('请联系会话所有者恢复授权或领取新的邀请码。')).toBeInTheDocument()
})

it('preserves unsent input when the upstream rejects sending', async () => {
  fixture.send.mockRejectedValueOnce(new Error('连接中断'))
  render(<CollaborationWorkbench identity="ERP:42" adapter={adapter} context={context} />)
  await screen.findByText('样衣试点 · 已连接')
  fireEvent.change(screen.getByLabelText('业务需求'), {target:{value:'不要丢失的描述'}})
  fireEvent.click(screen.getByRole('button',{name:'发送需求'}))
  await screen.findByText('连接中断')
  expect(screen.getByLabelText('业务需求')).toHaveValue('不要丢失的描述')
})


it('keeps instances independent and uses host module context', async () => {
  render(<><CollaborationWorkbench identity="one" adapter={adapter} context={context} /><CollaborationWorkbench identity="two" adapter={adapter} context={{systemName:'库存平台', moduleName:'收货'}} /></>)
  await waitFor(() => expect(fixture.connect).toHaveBeenCalledTimes(2))
  const inputs = screen.getAllByLabelText('业务需求')
  expect(inputs[0].id).not.toBe(inputs[1].id)
  expect(screen.getByText('采购系统 / 询价管理')).toBeInTheDocument()
  expect(screen.getByText('库存平台 / 收货')).toBeInTheDocument()
})
