import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { saveMessageSendRecord, updateMessageSendRecord, useMessageSendRecords } from './messageSendRecords'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

it('persists full input and attachment references across remounts while keeping accounts and sessions isolated', () => {
  saveMessageSendRecord('u1', 's1', { id: 'm1', text: '# 文档\n\n完整正文', createdAt: 1, status: 'waiting',
    attachments: [{ name: 'image.png', path: '/safe/upload.png', mime: 'image/png', url: 'blob:expired' }] })
  const mounted = renderHook(() => useMessageSendRecords('u1', 's1'))
  expect(mounted.result.current.records[0]).toMatchObject({ text: '# 文档\n\n完整正文', status: 'waiting' })
  expect(mounted.result.current.records[0].attachments?.[0]).not.toHaveProperty('url')
  mounted.unmount()
  const restored = renderHook(() => useMessageSendRecords('u1', 's1'))
  expect(restored.result.current.records).toHaveLength(1)
  expect(renderHook(() => useMessageSendRecords('u2', 's1')).result.current.records).toHaveLength(0)
  expect(renderHook(() => useMessageSendRecords('u1', 's2')).result.current.records).toHaveLength(0)
})

it('writes separate message keys so independent senders cannot replace each other', () => {
  saveMessageSendRecord('u', 's', { id: 'first', text: '标签页一', createdAt: 1, status: 'waiting' })
  saveMessageSendRecord('u', 's', { id: 'second', text: '标签页二', createdAt: 2, status: 'waiting' })
  expect(localStorage.length).toBe(2)
  const { result } = renderHook(() => useMessageSendRecords('u', 's'))
  act(() => updateMessageSendRecord('u', 's', 'first', 'accepted'))
  expect(result.current.records).toMatchObject([{ id: 'first', status: 'accepted' }, { id: 'second', status: 'waiting' }])
})

it('preserves an engine failure and does not turn a late acceptance into success', () => {
  saveMessageSendRecord('u', 's', { id: 'm', text: '任务', createdAt: 1, status: 'waiting' })
  const { result } = renderHook(() => useMessageSendRecords('u', 's'))
  act(() => updateMessageSendRecord('u', 's', 'm', 'accepted'))
  expect(result.current.records[0].status).toBe('accepted')
  act(() => updateMessageSendRecord('u', 's', 'm', 'failed', 'CODEX_QUERY_FAILED'))
  act(() => updateMessageSendRecord('u', 's', 'm', 'accepted'))
  expect(result.current.records[0]).toMatchObject({ text: '任务', status: 'failed', note: 'CODEX_QUERY_FAILED' })
})

it('keeps all unresolved inputs when pruning old settled records', () => {
  saveMessageSendRecord('u', 's', { id: 'pending', text: '待确认原文', createdAt: 1, status: 'waiting' })
  for (let i = 0; i < 25; i++) saveMessageSendRecord('u', 's', { id: String(i), text: '已返回', createdAt: i + 2, status: 'settled' })
  const { result } = renderHook(() => useMessageSendRecords('u', 's'))
  expect(result.current.records).toHaveLength(21)
  expect(result.current.records[0].text).toBe('待确认原文')
})

it('fails before send when durable storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError') })
  expect(() => saveMessageSendRecord('u', 's', { id: 'm', text: '仍在草稿', createdAt: 1, status: 'waiting' })).toThrow('full')
})
