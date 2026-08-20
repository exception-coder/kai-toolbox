import { describe, expect, it } from 'vitest'
import {
  finalizeRunningActivities,
  reduceTurnRunningState,
  TERMINAL_TURN_RUNNING_STATE,
  type TurnRunningState,
} from './turnRunningState'
import type { ChatItem } from '../types'

describe('reduceTurnRunningState', () => {
  it('does not let late runtime evidence revive a terminal turn', () => {
    const state = reduceTurnRunningState(TERMINAL_TURN_RUNNING_STATE, 'runtimeEvidence')

    expect(state).toEqual({ running: false, terminal: true })
  })

  it.each(['localStart', 'serverRunning', 'turnStarted'] as const)(
    'allows %s to open a new turn after a terminal state',
    signal => {
      const state = reduceTurnRunningState(TERMINAL_TURN_RUNNING_STATE, signal)

      expect(state).toEqual({ running: true, terminal: false })
    },
  )

  it('keeps current-turn runtime evidence running until a terminal signal arrives', () => {
    const active: TurnRunningState = { running: true, terminal: false }
    const withEvidence = reduceTurnRunningState(active, 'runtimeEvidence')
    const completed = reduceTurnRunningState(withEvidence, 'terminal')

    expect(withEvidence).toEqual({ running: true, terminal: false })
    expect(completed).toEqual({ running: false, terminal: true })
  })

  it('fails unfinished activity cards when the turn reaches a terminal state', () => {
    const items: ChatItem[] = [
      { kind: 'activity', id: 'shell-1', activityType: 'tool', status: 'inProgress', title: '正在执行命令', ts: 1 },
      { kind: 'activity', id: 'file-1', activityType: 'file', status: 'completed', title: '编辑了文件', ts: 2 },
    ]

    const finalized = finalizeRunningActivities(items, '回合已结束，活动未返回独立终态')

    expect(finalized[0]).toMatchObject({ status: 'failed', outcome: 'processFailure', severity: 'warning' })
    expect(finalized[1]).toBe(items[1])
  })

  it('does not rewrite already terminal activity cards', () => {
    const items: ChatItem[] = [
      { kind: 'activity', id: 'shell-1', activityType: 'tool', status: 'failed', title: '命令失败', ts: 1 },
    ]

    expect(finalizeRunningActivities(items, '回合已结束')).toBe(items)
  })
})
