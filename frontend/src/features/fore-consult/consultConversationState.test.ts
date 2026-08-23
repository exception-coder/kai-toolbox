import { describe, expect, it } from 'vitest'
import type { ChatItem, SessionRuntimeState } from '@/features/claude-chat/public-api'
import {
  deriveConsultConversationState,
  hasUnansweredUserTurn,
  RUNTIME_TERMINAL_STARTUP_GRACE_MS,
} from './consultConversationState'

const NOW = 100_000
const user = (id = 'user-1', ts = NOW - 60_000): ChatItem => ({ kind: 'user', id, text: '上一问', ts })
const assistant = (text = '回答'): ChatItem => ({ kind: 'assistant', id: 'assistant-1', text })

function runtime(
  effectiveStatus: SessionRuntimeState['effectiveStatus'],
  observedAt = NOW,
): SessionRuntimeState {
  return {
    sessionId: 'session-1',
    effectiveStatus,
    consistency: 'CONSISTENT',
    persistedStatus: effectiveStatus === 'INTERRUPTED' ? 'INTERRUPTED' : effectiveStatus === 'IDLE' ? 'IDLE' : 'RUNNING',
    backendStatus: null,
    browserConnected: true,
    javaSidecarConnected: true,
    sidecarSessionPresent: true,
    sidecarActive: effectiveStatus === 'RUNNING',
    pendingDecision: false,
    backgroundTaskCount: 0,
    activeTurnId: null,
    phase: null,
    agentState: effectiveStatus === 'IDLE' ? 'idle' : 'running',
    lastHeartbeatAt: observedAt,
    observedAt,
    stale: false,
    canSend: effectiveStatus === 'IDLE',
    canQueue: false,
    canInterrupt: effectiveStatus === 'RUNNING',
    reason: 'test',
    recommendedAction: 'test',
  }
}

function derive(overrides: Partial<Parameters<typeof deriveConsultConversationState>[0]> = {}) {
  return deriveConsultConversationState({
    items: [user()],
    localRunning: false,
    dispatching: false,
    runtimeState: runtime('IDLE'),
    runtimePending: false,
    runtimeError: false,
    runtimeActiveObservedForTurn: false,
    now: NOW,
    ...overrides,
  })
}

describe('consult conversation state', () => {
  it('识别最后一轮存在有效回答', () => {
    expect(hasUnansweredUserTurn([user(), assistant()])).toBe(false)
    expect(hasUnansweredUserTurn([user(), assistant('')])).toBe(true)
  })

  it('Runtime 活动态优先保持等待', () => {
    expect(derive({
      runtimeState: runtime('FINALIZING'),
    }).phase).toBe('running')
  })

  it('Runtime 终止态校正浏览器残留运行态', () => {
    const state = derive({
      localRunning: true,
      runtimeState: runtime('IDLE'),
      runtimeActiveObservedForTurn: true,
    })
    expect(state.phase).toBe('stoppedWithoutResponse')
    expect(state.waiting).toBe(false)
  })

  it('已有回答时不会误报停止但无回答', () => {
    expect(derive({
      items: [user(), assistant()],
    }).phase).toBe('idle')
  })

  it('消息被明确拒绝时展示具体错误而不是通用无回答终态', () => {
    const rejection: ChatItem = {
      kind: 'error',
      id: 'error-1',
      code: 'MESSAGE_REJECTED',
      message: '附件不属于当前会话',
    }
    expect(hasUnansweredUserTurn([user(), rejection])).toBe(false)
    expect(derive({ items: [user(), rejection] }).phase).toBe('idle')
  })

  it('Runtime 不可用时结束动画并进入可恢复状态', () => {
    const state = derive({
      runtimeState: undefined,
      runtimePending: false,
      runtimeError: true,
    })
    expect(state.phase).toBe('runtimeUnavailable')
    expect(state.waiting).toBe(false)
  })

  it('过期 Runtime 快照不能被当作可信终态', () => {
    const staleRuntime = runtime('IDLE')
    staleRuntime.stale = true
    staleRuntime.consistency = 'STALE'
    expect(derive({
      runtimeState: staleRuntime,
    }).phase).toBe('runtimeUnavailable')
  })

  it('本地调度阶段不会被尚未启动的 Runtime 空闲态覆盖', () => {
    expect(derive({
      dispatching: true,
    }).phase).toBe('dispatching')
  })

  it('新消息发送后不会被上一轮缓存的 IDLE 立即判停', () => {
    const turnStartedAt = NOW - 100
    const state = derive({
      items: [user('user-new', turnStartedAt)],
      localRunning: true,
      runtimeState: runtime('IDLE', turnStartedAt - 1),
    })
    expect(state.phase).toBe('running')
    expect(state.waiting).toBe(true)
  })

  it('当前轮尚未观察到活动态时在启动宽限内继续核对', () => {
    const turnStartedAt = NOW - RUNTIME_TERMINAL_STARTUP_GRACE_MS + 1
    expect(derive({
      items: [user('user-new', turnStartedAt)],
      localRunning: false,
      runtimeState: runtime('IDLE', NOW),
    }).phase).toBe('checking')
  })

  it('当前轮观察过活动态后接受后续终态', () => {
    const turnStartedAt = NOW - 1_000
    expect(derive({
      items: [user('user-new', turnStartedAt)],
      localRunning: true,
      runtimeState: runtime('IDLE', NOW),
      runtimeActiveObservedForTurn: true,
    }).phase).toBe('stoppedWithoutResponse')
  })

  it('从未观察到活动态的异常回合超过宽限后也会结束等待', () => {
    const turnStartedAt = NOW - RUNTIME_TERMINAL_STARTUP_GRACE_MS
    expect(derive({
      items: [user('user-new', turnStartedAt)],
      localRunning: true,
      runtimeState: runtime('IDLE', NOW),
    }).phase).toBe('stoppedWithoutResponse')
  })
})
