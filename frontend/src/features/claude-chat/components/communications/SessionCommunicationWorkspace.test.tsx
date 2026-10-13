import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import SessionCommunicationWorkspace from './SessionCommunicationWorkspace'
import { journalFileIssue } from './CommunicationEditor'
import { editJournalDraft, newJournalDraft, readJournalDraft, writeJournalDraft } from './journalDraft'
import { ApiError } from '@/lib/api'
import type { CommunicationDetail, CommunicationPage, CommunicationReference } from '../../api/communicationJournal'
import { communicationReferenceText, listCommunications, getCommunication, saveCommunication, referenceCommunications, removeCommunication, uploadCommunicationImage } from '../../api/communicationJournal'

vi.mock('../../api/communicationJournal', async () => ({
  ...await vi.importActual('../../api/communicationJournal'),
  listCommunications: vi.fn(), getCommunication: vi.fn(), saveCommunication: vi.fn(),
  referenceCommunications: vi.fn(), removeCommunication: vi.fn(), uploadCommunicationImage: vi.fn(),
}))
const sid = 'session-journal-test', id = '0195f671-0062-475a-a4bd-366d60bac8c5'
const record: CommunicationDetail = { record: { id, sessionId: sid, title: '生产单保存过程', occurredAt: 1791849900000,
  source: '飞书', participants: '张凯', sourceUrl: '', originalText: '先保存，再核对生产单。', notes: '待确认默认字段。', attachmentIds: [], version: 1,
  deletedAt: null, createdAt: 1791849900000, updatedAt: 1791849900000 }, images: [] }
const page: CommunicationPage = { page: 0, pageSize: 20, total: 1, records: [{ id, title: record.record.title,
  occurredAt: record.record.occurredAt, source: '飞书', participants: '张凯', excerpt: '先保存，再核对生产单。', notesExcerpt: '待确认默认字段。',
  imageCount: 0, version: 1, deletedAt: null, updatedAt: record.record.updatedAt }] }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const clients: QueryClient[] = []
function shell(component: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  return <QueryClientProvider client={client}>{component}</QueryClientProvider>
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCommunications).mockResolvedValue(page)
  vi.mocked(getCommunication).mockResolvedValue(record)
  vi.mocked(saveCommunication).mockResolvedValue(record)
  vi.mocked(referenceCommunications).mockResolvedValue({ records: [record.record], attachments: [] })
  writeJournalDraft(sid, null); writeJournalDraft('other-journal-test', null)
})
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0 })

it('reads original material, selects several records and only asks the current composer to reference', async () => {
  const second = { ...page.records[0], id: '0195f671-0062-475a-a4bd-366d60bac8c6', title: '后续确认' }
  vi.mocked(listCommunications).mockResolvedValue({ ...page, total: 2, records: [...page.records, second] })
  const quote = vi.fn().mockResolvedValue(undefined)
  render(shell(<SessionCommunicationWorkspace sessionId={sid} sessionTitle="需求会话" onReference={quote} />))
  fireEvent.click(await screen.findByRole('button', { name: /生产单保存过程/ }))
  expect(await screen.findByText('先保存，再核对生产单。', { selector: 'p' })).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('选择记录 生产单保存过程'))
  fireEvent.click(screen.getByLabelText('选择记录 后续确认'))
  fireEvent.click(screen.getByRole('button', { name: '引用所选' }))
  await waitFor(() => expect(referenceCommunications).toHaveBeenCalledWith(sid, [id, second.id]))
  expect(quote).toHaveBeenCalledWith(sid, { records: [record.record], attachments: [] })
  expect(saveCommunication).not.toHaveBeenCalled()
})

it('never displays a previous session response or references it after switching', async () => {
  const oldList = deferred<CommunicationPage>(), oldQuote = deferred<CommunicationReference>()
  vi.mocked(listCommunications).mockImplementation(session => session === sid ? oldList.promise : Promise.resolve({ ...page, records: [], total: 0 }))
  const quote = vi.fn().mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.push(client)
  const node = (sessionId: string) => <QueryClientProvider client={client}><SessionCommunicationWorkspace sessionId={sessionId} sessionTitle={sessionId} onReference={quote} /></QueryClientProvider>
  const ui = render(node(sid))
  ui.rerender(node('other-journal-test'))
  await act(async () => oldList.resolve(page))
  expect(screen.queryByText('生产单保存过程')).not.toBeInTheDocument()
  ui.rerender(node(sid))
  fireEvent.click(await screen.findByRole('button', { name: /生产单保存过程/ }))
  await screen.findByRole('heading', { name: '沟通原文' })
  vi.mocked(referenceCommunications).mockReturnValue(oldQuote.promise)
  fireEvent.click(screen.getByRole('button', { name: '引用到草稿' }))
  ui.rerender(node('other-journal-test'))
  await act(async () => oldQuote.resolve({ records: [record.record], attachments: [] }))
  expect(quote).not.toHaveBeenCalled()
})

it('keeps stable draft identity when saving fails, and keeps the original draft on version conflicts', async () => {
  vi.mocked(saveCommunication).mockRejectedValueOnce(new ApiError(409, null, '记录已更新，请核对'))
  render(shell(<SessionCommunicationWorkspace sessionId={sid} sessionTitle="需求会话" onReference={vi.fn()} />))
  fireEvent.click(screen.getByRole('button', { name: '新增记录' }))
  fireEvent.change(screen.getByLabelText('主题'), { target: { value: '新增沟通' } })
  fireEvent.change(screen.getByLabelText('沟通原文'), { target: { value: '新的原始内容' } })
  const firstId = readJournalDraft(sid)?.id
  fireEvent.submit(document.querySelector('form')!)
  expect(await screen.findByText('记录已更新，请核对')).toBeInTheDocument()
  expect(screen.getByLabelText('沟通原文')).toHaveValue('新的原始内容')
  fireEvent.click(screen.getByRole('button', { name: '暂存并关闭' }))
  fireEvent.click(screen.getByRole('button', { name: '继续草稿' }))
  fireEvent.submit(document.querySelector('form')!)
  await screen.findByText('沟通记录已保存。')
  expect(vi.mocked(saveCommunication).mock.calls.map(call => call[1])).toEqual([firstId, firstId])
  expect(readJournalDraft(sid)).toBeNull()
})

it('keeps a late save in the original session and leaves the newly opened session draft alone', async () => {
  const pending = deferred<CommunicationDetail>()
  vi.mocked(saveCommunication).mockReturnValue(pending.promise)
  const quote = vi.fn(), client = new QueryClient(); clients.push(client)
  const node = (sessionId: string) => <QueryClientProvider client={client}><SessionCommunicationWorkspace sessionId={sessionId} sessionTitle={sessionId} onReference={quote} /></QueryClientProvider>
  const ui = render(node(sid))
  fireEvent.click(screen.getByRole('button', { name: '新增记录' }))
  fireEvent.change(screen.getByLabelText('主题'), { target: { value: '原会话草稿' } })
  fireEvent.change(screen.getByLabelText('沟通原文'), { target: { value: '原会话原文' } })
  fireEvent.submit(document.querySelector('form')!)
  ui.rerender(node('other-journal-test'))
  fireEvent.click(screen.getByRole('button', { name: '新增记录' }))
  fireEvent.change(screen.getByLabelText('主题'), { target: { value: '另一个会话草稿' } })
  await act(async () => pending.resolve(record))
  expect(screen.getByLabelText('主题')).toHaveValue('另一个会话草稿')
  expect(readJournalDraft('other-journal-test')?.input.title).toBe('另一个会话草稿')
})

it('shows recoverable list failures and permits only reading for a locked session', async () => {
  vi.mocked(listCommunications).mockRejectedValueOnce(new ApiError(404, null, 'not loaded'))
  render(shell(<SessionCommunicationWorkspace sessionId={sid} sessionTitle="锁定需求" readOnly onReference={vi.fn()} />))
  expect(await screen.findByRole('button', { name: '重试列表' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '重试列表' }))
  fireEvent.click(await screen.findByRole('button', { name: /生产单保存过程/ }))
  expect(await screen.findByRole('button', { name: '编辑' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '引用到草稿' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '新增记录' })).toBeDisabled()
})

it('soft removes and restores without claiming a failed operation succeeded', async () => {
  vi.mocked(removeCommunication).mockResolvedValue({ ...record, record: { ...record.record, deletedAt: Date.now(), version: 2 } })
  render(shell(<SessionCommunicationWorkspace sessionId={sid} sessionTitle="需求会话" onReference={vi.fn()} />))
  fireEvent.click(await screen.findByRole('button', { name: /生产单保存过程/ }))
  fireEvent.click(await screen.findByRole('button', { name: '移除（可恢复）' }))
  await screen.findByText('已移除，可在「已移除」中恢复。')
  expect(removeCommunication).toHaveBeenCalledWith(sid, id, 1, true)
  expect(uploadCommunicationImage).not.toHaveBeenCalled()
})

it('includes traceable record links and distinguishes original text from user notes', () => {
  const text = communicationReferenceText({ records: [record.record], attachments: [] })
  expect(text).toContain('view=communications')
  expect(text).toContain(`sessionId=${sid}`)
  expect(text).toContain(`recordId=${id}`)
  expect(text).toContain('沟通原文：')
  expect(text).toContain('用户整理备注（待结合原文核对）')
})

it('adds uploaded screenshots to the owning draft and blocks a duplicate upload while pending', async () => {
  const upload = deferred<{ id: string; name: string; mime: string; size: number; path: string }>()
  vi.mocked(uploadCommunicationImage).mockReturnValue(upload.promise)
  render(shell(<SessionCommunicationWorkspace sessionId={sid} sessionTitle="需求会话" onReference={vi.fn()} />))
  fireEvent.click(screen.getByRole('button', { name: '新增记录' }))
  const fileInput = screen.getByLabelText('选择沟通截图')
  const file = new File(['png'], 'process.png', { type: 'image/png' })
  fireEvent.change(fileInput, { target: { files: [file] } })
  expect(screen.getByRole('button', { name: '保存记录' })).toBeDisabled()
  fireEvent.change(fileInput, { target: { files: [file] } })
  expect(uploadCommunicationImage).toHaveBeenCalledTimes(1)
  await act(async () => upload.resolve({ id: 'att_1', name: 'process.png', mime: 'image/png', size: 100, path: 'local-test.png' }))
  expect(readJournalDraft(sid)?.input.attachmentIds).toEqual(['att_1'])
  expect(screen.getByRole('button', { name: '移除截图 process.png' })).toBeInTheDocument()
})

it('separates persisted draft ownership and rejects unsupported or excessive screenshot batches', () => {
  const draft = editJournalDraft(record)
  writeJournalDraft(sid, draft, 'user-1')
  expect(readJournalDraft(sid, 'user-2')).toBeNull()
  expect(readJournalDraft(sid, 'user-1')?.id).toBe(id)
  expect(journalFileIssue([new File(['<svg/>'], 'screen.svg', { type: 'image/svg+xml' })], newJournalDraft())).toContain('请选择')
  expect(journalFileIssue(Array.from({ length: 11 }, () => new File(['png'], 'screen.png', { type: 'image/png' })), newJournalDraft())).toContain('最多 10')
  const large = newJournalDraft(); large.images = [{ id: 'att-1', name: 'big.png', mime: 'image/png', size: 25 * 1024 * 1024 }]
  expect(journalFileIssue([new File(['png'], 'screen.png', { type: 'image/png' })], large)).toContain('25 MiB')
})
