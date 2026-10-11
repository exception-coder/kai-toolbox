import { afterEach, describe, expect, it, vi } from 'vitest'
import { listQueuedMessages, type PersistedQueuedMessage } from '../api'
import type { ClaudeChatSessionView } from '../types'
import { boardSessionState, isBoardSessionRunning, projectBoardQueue, readBoardQueue, recentBoardSessions } from './sessionBoard'

vi.mock('../api', () => ({ listQueuedMessages: vi.fn() }))
const readQueue = vi.mocked(listQueuedMessages)

function session(id: string, seen: number, fields: Partial<ClaudeChatSessionView> = {}): ClaudeChatSessionView {
  return { id, title: id, cwd: 'D:/work', sdkSessionId: id, status: 'IDLE', live: false, startedAt: 1, lastSeenAt: seen, ...fields }
}

function message(id: string, fields: Partial<PersistedQueuedMessage> = {}): PersistedQueuedMessage {
  return { id, sessionId: 'work', text: '继续开发', createdAt: 1, ...fields }
}

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks() })

describe('recent session board projections', () => {
  it('bounds the valid recent set before filtering, without favorites or input mutation', () => {
    const sessions = Array.from({ length: 24 }, (_, i) => session(`s${i}`, i, { favorite: i === 0 }))
    sessions.push(session('locked', 100, { planExpired: true }), session('consult', 101, { group: '业务咨询' }))
    const recent = recentBoardSessions(sessions)
    expect(recent).toHaveLength(20)
    expect(recent.map(item => item.id)).toEqual(Array.from({ length: 20 }, (_, i) => `s${23 - i}`))
    expect(sessions[0].id).toBe('s0')
    expect(boardSessionState(session('ghost', 1, { status: 'RUNNING', live: false }))).toBe('待恢复')
    expect(isBoardSessionRunning(session('ghost', 1, { status: 'RUNNING', live: false }))).toBe(false)
  })

  it('keeps queue order, bounded display previews and exact session ownership', () => {
    const messages = [message('four', { createdAt: 4 }), message('two', { createdAt: 2, displayText: '按评审调整', developerInstructions: 'hidden' }),
      message('three', { createdAt: 3, text: 'x'.repeat(300) }), message('one', { text: '', attachments: [{ name: 'image', path: 'private/path' }] })]
    const summary = projectBoardQueue('work', messages)
    expect(summary.count).toBe(4)
    expect(summary.tasks.map(task => task.id)).toEqual(['one', 'two', 'three'])
    expect(summary.tasks[0]).toMatchObject({ preview: '附件任务', attachmentCount: 1 })
    expect(summary.tasks[1].preview).toBe('按评审调整')
    expect(summary.tasks[2].preview).toHaveLength(161)
    expect(JSON.stringify(summary)).not.toContain('hidden')
    expect(JSON.stringify(summary)).not.toContain('private/path')
    expect(() => projectBoardQueue('other', messages)).toThrow('队列归属')
  })

  it('limits active reads and cancels queued work without requesting another session', async () => {
    const completions: Array<() => void> = []
    let active = 0
    let peak = 0
    readQueue.mockImplementation((sessionId, signal) => new Promise((resolve, reject) => {
      active += 1; peak = Math.max(peak, active)
      const abort = () => { active -= 1; reject(new DOMException('aborted', 'AbortError')) }
      signal!.addEventListener('abort', abort, { once: true })
      completions.push(() => { signal!.removeEventListener('abort', abort); active -= 1; resolve([message(sessionId, { sessionId })]) })
    }))
    const controllers = Array.from({ length: 6 }, () => new AbortController())
    const reads = controllers.map((controller, index) => readBoardQueue(`s${index}`, controller.signal))
    const results = Promise.allSettled(reads)
    expect(readQueue).toHaveBeenCalledTimes(4)
    controllers[4].abort()
    completions.shift()!()
    await vi.waitFor(() => expect(readQueue).toHaveBeenCalledTimes(5))
    while (completions.length) completions.shift()!()
    const settled = await results
    expect(peak).toBe(4)
    expect(settled[4].status).toBe('rejected')
    expect(readQueue.mock.calls.map(([id]) => id)).not.toContain('s4')
    expect(settled[5]).toMatchObject({ status: 'fulfilled', value: { tasks: [{ id: 's5' }] } })
  })

  it('aborts a slow active read and releases its slot after eight seconds', async () => {
    vi.useFakeTimers()
    readQueue.mockImplementation((_id, signal) => new Promise((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(new DOMException('timeout', 'AbortError')), { once: true })
    }))
    const result = Promise.allSettled([readBoardQueue('slow', new AbortController().signal)])
    await vi.advanceTimersByTimeAsync(8_000)
    expect((await result)[0].status).toBe('rejected')
    readQueue.mockResolvedValue([])
    expect(await readBoardQueue('next', new AbortController().signal)).toEqual({ count: 0, tasks: [] })
  })
})
