import { useMemo, useSyncExternalStore } from 'react'
import type { SendAttachment } from '../types'

export type SendRecordStatus = 'waiting' | 'accepted' | 'queued' | 'failed' | 'settled'
export interface MessageSendRecord {
  id: string
  text: string
  attachments?: SendAttachment[]
  createdAt: number
  status: SendRecordStatus
  note?: string
}

const PREFIX = 'kai-toolbox:message-send-records:v1:'
const listeners = new Set<() => void>()
let revision = 0
export const messageRecordScope = (userId?: number) => userId == null ? 'anonymous' : String(userId)
const sessionPrefix = (scope: string, sessionId: string) => `${PREFIX}${encodeURIComponent(scope)}/${encodeURIComponent(sessionId)}/`
const notify = () => { revision++; listeners.forEach(listener => listener()) }
window.addEventListener('storage', event => { if (event.key == null || event.key.startsWith(PREFIX)) notify() })

function readRecords(scope: string, sessionId: string): MessageSendRecord[] {
  const prefix = sessionPrefix(scope, sessionId)
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
  return keys.filter((key): key is string => !!key?.startsWith(prefix)).flatMap(key => {
    const raw = localStorage.getItem(key)
    return raw ? [parseRecord(raw)] : []
  }).sort((a, b) => a.createdAt - b.createdAt)
}

function parseRecord(raw: string): MessageSendRecord {
  const record = JSON.parse(raw)
  if (!(record && typeof record.id === 'string'
    && typeof record.text === 'string' && typeof record.createdAt === 'number'
    && ['waiting', 'accepted', 'queued', 'failed', 'settled'].includes(record.status)
    && (record.attachments == null || Array.isArray(record.attachments)
      && record.attachments.every((file: SendAttachment) => file && typeof file.name === 'string' && typeof file.path === 'string')))) {
    throw new Error('发送记录无法读取，请先备份浏览器数据')
  }
  return record
}

/** 先同步持久化用户原文和附件引用，再允许清空草稿或发出请求。 */
export function saveMessageSendRecord(scope: string, sessionId: string, record: MessageSendRecord) {
  const prefix = sessionPrefix(scope, sessionId)
  const previous = readRecords(scope, sessionId)
  // 只裁剪已经收到了轮次结果的旧记录，未确认与失败原文由用户主动删除。
  // 每条消息独立写入，两个标签页同时发送也不会覆盖彼此的原文。
  const saved = { ...record, attachments: record.attachments?.map(({ name, path, mime }) => ({ name, path, mime })) }
  localStorage.setItem(prefix + record.id, JSON.stringify(saved))
  const settled = previous.filter(item => item.status === 'settled' && item.id !== record.id)
  const retain = record.status === 'settled' ? 19 : 20
  for (const item of settled.slice(0, Math.max(0, settled.length - retain))) localStorage.removeItem(prefix + item.id)
  notify()
}

export function updateMessageSendRecord(scope: string, sessionId: string, id: string,
  status: SendRecordStatus, note?: string) {
  const key = sessionPrefix(scope, sessionId) + id
  const raw = localStorage.getItem(key)
  const found = raw ? parseRecord(raw) : null
  if (!found || found.status === 'settled' || status === 'accepted' && found.status === 'failed') return
  if (status === 'queued' && found.status !== 'waiting') return
  localStorage.setItem(key, JSON.stringify({ ...found, status, note }))
  notify()
}

export function deleteMessageSendRecord(scope: string, sessionId: string, id: string) {
  localStorage.removeItem(sessionPrefix(scope, sessionId) + id)
  notify()
}

function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function useMessageSendRecords(scope: string, sessionId?: string) {
  const current = useSyncExternalStore(subscribe, () => revision)
  return useMemo(() => {
    try { return { records: sessionId ? readRecords(scope, sessionId) : [], error: null } } catch {
      return { records: [], error: '本机发送记录读取失败，请保留当前浏览器数据。' }
    }
  }, [scope, sessionId, current])
}
