import { describe, expect, it } from 'vitest'
import {
  applyCodexActivity, applySubagentSnapshot, applyToolActivity, applyTurnActivity,
  engineConnectionItem, engineSubagentSummary, isRunningActivity,
} from './activityItems'
import type { ChatItem, ServerMessage } from '../types'

type Msg<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>
const tool = (patch: Partial<Msg<'toolActivity'>>): Msg<'toolActivity'> =>
  ({ type: 'toolActivity', seq: 1, toolCallId: 'c1', toolName: 'Bash', status: 'running', title: 'ls', ...patch })
const engineEvent = (patch: Partial<Msg<'engineEvent'>>): Msg<'engineEvent'> => ({
  type: 'engineEvent', seq: 1, protocolVersion: 1, eventId: 'e1', sessionId: 's', turnId: 't1', engine: 'codex',
  eventType: 'subagents.snapshot', observedAt: 50, payload: {}, ...patch,
})

describe('activityItems', () => {
  it('recognises running statuses', () => {
    expect(['inProgress', 'in_progress', 'running', 'pending', 'started'].every(isRunningActivity)).toBe(true)
    expect(isRunningActivity('completed')).toBe(false)
  })

  it('upserts tool activity by call id and keeps the first timestamp', () => {
    const started = applyToolActivity([], tool({}), 10)
    expect(started).toEqual([expect.objectContaining({ id: 'tool-activity-c1', status: 'running', ts: 10 })])
    const done = applyToolActivity(started, tool({ status: 'completed' }), 20)
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({ status: 'completed', ts: 10 })
  })

  it('marks a recent shell syntax failure of the same tool as recovered after a successful retry', () => {
    const failed: ChatItem[] = [{ kind: 'activity', id: 'tool-activity-c0', activityType: 'tool', status: 'failed',
      title: 'dir', outcome: 'shellSyntax', data: { toolName: 'Bash' } }]
    const next = applyToolActivity(failed, tool({ toolCallId: 'c2', status: 'completed', outcome: 'success' }), 30)
    expect(next[0]).toMatchObject({ title: '已自动重试 · dir', outcome: 'recovered', severity: 'info' })
    expect(failed[0]).toMatchObject({ outcome: 'shellSyntax' })
    const otherTool = applyToolActivity(failed, tool({ toolCallId: 'c3', toolName: 'Read', outcome: 'success' }), 30)
    expect(otherTool[0]).toMatchObject({ outcome: 'shellSyntax' })
  })

  it('keeps a single turn card and upserts codex activity', () => {
    const turn: Msg<'turnActivity'> = { type: 'turnActivity', seq: 1, status: 'running', phase: 'tools', title: '执行中' }
    const once = applyTurnActivity([], turn, 1)
    expect(applyTurnActivity(once, { ...turn, status: 'completed' }, 2)).toEqual([
      expect.objectContaining({ id: 'turn-activity-current', status: 'completed', ts: 2 }),
    ])
    const codex: Msg<'codexActivity'> = { type: 'codexActivity', seq: 7, activityType: 'plan', itemId: '', status: 'running', title: '计划' }
    expect(applyCodexActivity([], codex, 3)[0]).toMatchObject({ id: 'codex-activity-plan-7', activityType: 'plan' })
  })

  it('summarises subagents and renders connection events', () => {
    const payload = { agents: [{ state: 'running' }, { state: 'done' }, null] }
    const summary = engineSubagentSummary(payload)
    expect(summary).toEqual({ total: 3, running: 1 })
    expect(applySubagentSnapshot([], engineEvent({ payload }), summary)[0])
      .toMatchObject({ id: 'engine-subagents-t1', status: 'inProgress', title: 'codex 子 Agent 作业中 · 1/3', ts: 50 })
    expect(engineConnectionItem(engineEvent({ eventType: 'engine.connection', payload: { transport: 'connected' } })))
      .toMatchObject({ id: 'engine-connection-e1', status: 'completed', title: 'codex 已连接' })
  })
})
