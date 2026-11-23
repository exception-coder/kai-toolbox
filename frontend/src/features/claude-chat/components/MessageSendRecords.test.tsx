import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MessageSendRecords } from './MessageSendRecords'
import { saveMessageSendRecord } from '../lib/messageSendRecords'
import { loadDrafts, setDraftFor } from '../lib/draftPref'
import { listChatSubmissions } from '../api'

vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 123 } }) }))
vi.mock('../api', () => ({ listChatSubmissions: vi.fn().mockResolvedValue([]) }))
afterEach(cleanup)
beforeEach(() => {
  localStorage.clear()
  vi.mocked(listChatSubmissions).mockResolvedValue([])
})

it('recovers server-owned input after browser storage is empty', async () => {
  vi.mocked(listChatSubmissions).mockResolvedValue([{ id: 'remote', sessionId: 'remote-session', text: '服务端保存的原文', attachments: [], status: 'FAILED', note: '引擎初始化超时', createdAt: 2 }])
  render(<MessageSendRecords sessionId="remote-session" />)
  fireEvent.click(screen.getByRole('button', { name: /发送记录/ }))
  expect((await screen.findAllByText('服务端保存的原文'))[0]).toBeVisible()
  expect(screen.getByText('服务端记录：引擎初始化超时')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '恢复到输入框' }))
  expect(loadDrafts()['remote-session']).toBe('服务端保存的原文')
})

it('restores failed input next to an existing draft without automatically sending it', () => {
  setDraftFor('recovery-test', '正在写的新内容')
  saveMessageSendRecord('123', 'recovery-test', { id: 'failed', text: '原来发送的任务', createdAt: 1, status: 'failed', note: '引擎启动异常' })
  render(<MessageSendRecords sessionId="recovery-test" />)
  fireEvent.click(screen.getByRole('button', { name: /发送记录/ }))
  expect(screen.getByText('发送或调用异常')).toBeVisible()
  expect(screen.getByText('引擎启动异常')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '恢复到输入框' }))
  expect(loadDrafts()['recovery-test']).toBe('正在写的新内容\n\n原来发送的任务')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
