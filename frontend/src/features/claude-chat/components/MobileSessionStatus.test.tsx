import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { SessionUsage } from '../api'
import type { ChatItem, SessionRuntimeState } from '../types'
import {
  MobileSessionStatus,
  deriveMobileSessionStatus,
} from './MobileSessionStatus'

const getSessionRuntimeState = vi.fn()

vi.mock('../api', () => ({
  getSessionRuntimeState: (...args: unknown[]) => getSessionRuntimeState(...args),
}))

const USAGE: SessionUsage = {
  inputTokens: 1_000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheCreateTokens: 0,
  totalTokens: 1_500,
  turns: 3,
}

const CONSISTENT_RUNTIME: SessionRuntimeState = {
  sessionId: 'session-1',
  effectiveStatus: 'IDLE',
  consistency: 'CONSISTENT',
  persistedStatus: 'IDLE',
  backendStatus: 'IDLE',
  browserConnected: true,
  javaSidecarConnected: true,
  sidecarSessionPresent: true,
  sidecarActive: false,
  pendingDecision: false,
  backgroundTaskCount: 0,
  activeTurnId: null,
  phase: null,
  agentState: null,
  lastHeartbeatAt: null,
  observedAt: 1,
  stale: false,
  canSend: true,
  canQueue: false,
  canInterrupt: false,
  reason: '会话空闲',
  recommendedAction: '可以发送消息',
}

function renderWithQueryClient(children: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>,
  )
}

afterEach(() => {
  cleanup()
  getSessionRuntimeState.mockReset()
})

describe('deriveMobileSessionStatus', () => {
  it('运行与断线重连优先于后台任务和历史完成结果', () => {
    const items: ChatItem[] = [
      { kind: 'result', id: 'result-1', stopReason: 'end_turn', latencyMs: 2_000 },
    ]

    expect(deriveMobileSessionStatus({
      items,
      running: true,
      engineLabel: 'Codex',
      turnTokens: 2_400,
      connState: 'ready',
      backgroundTasks: [{ taskId: 'task-1', taskType: 'analysis', description: '分析代码' }],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    })).toEqual({
      kind: 'running',
      label: 'Codex 正在运行 · 2.4千 Token',
      detail: undefined,
    })

    expect(deriveMobileSessionStatus({
      items,
      running: true,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'closed',
      backgroundTasks: [],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: null,
      usageLoading: false,
    })).toEqual({
      kind: 'running',
      label: '正在重连会话…',
      detail: 'Agent 可能仍在后台执行，连接恢复前不会误判为空闲。',
    })
  })

  it('主回合结束后仍有子任务时显示后台作业而不是已完成', () => {
    const status = deriveMobileSessionStatus({
      items: [{ kind: 'result', id: 'result-1', stopReason: 'end_turn' }],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [{ taskId: 'task-1', taskType: 'subagent', description: '检查移动端布局' }],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    })

    expect(status).toEqual({
      kind: 'background',
      label: '后台任务进行中 · 1',
      detail: '检查移动端布局',
    })
  })

  it('全链路查询失败或状态不一致时显示可解释的警告', () => {
    expect(deriveMobileSessionStatus({
      items: [],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [],
      runtimePending: false,
      runtimeError: true,
      usage: null,
      usageLoading: false,
    })).toEqual({
      kind: 'warning',
      label: '全链路状态暂不可用',
      detail: '发送前仍会由后端再次核对会话状态。',
    })

    expect(deriveMobileSessionStatus({
      items: [],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [],
      runtimeState: {
        ...CONSISTENT_RUNTIME,
        effectiveStatus: 'BACKGROUND_RUNNING',
        consistency: 'PERSISTENCE_DRIFT',
        reason: '浏览器与持久化状态不一致',
      },
      runtimePending: false,
      runtimeError: false,
      usage: null,
      usageLoading: false,
    })).toEqual({
      kind: 'warning',
      label: '状态待校正 · 后台作业中',
      detail: '浏览器与持久化状态不一致',
    })
  })

  it('正常结果合并耗时和输出 Token，异常结果保留中断语义', () => {
    expect(deriveMobileSessionStatus({
      items: [{
        kind: 'result',
        id: 'result-1',
        stopReason: 'end_turn',
        latencyMs: 65_000,
        usage: { output_tokens: 2_500 },
      }],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    })).toEqual({ kind: 'completed', label: '已完成 · 1m5s · 2.5千 Token' })

    expect(deriveMobileSessionStatus({
      items: [{ kind: 'result', id: 'result-2', stopReason: 'interrupted' }],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    })).toEqual({
      kind: 'warning',
      label: '本轮已中断',
      detail: '待发送队列不会自动继续。',
    })
  })

  it('最新用户消息之后没有结果时退化为累计用量，加载期间不占位', () => {
    const items: ChatItem[] = [
      { kind: 'result', id: 'old-result', stopReason: 'end_turn' },
      { kind: 'user', id: 'new-turn', text: '继续' },
    ]
    const base = {
      items,
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready' as const,
      backgroundTasks: [],
      runtimeState: CONSISTENT_RUNTIME,
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
    }

    expect(deriveMobileSessionStatus({ ...base, usageLoading: false })).toEqual({
      kind: 'usage',
      label: '会话累计 · 3 轮 · 1.5千 Token',
    })
    expect(deriveMobileSessionStatus({ ...base, usageLoading: true })).toBeNull()
  })

  it('首次全链路查询期间不基于旧 result 闪现已完成', () => {
    expect(deriveMobileSessionStatus({
      items: [{ kind: 'result', id: 'result-1', stopReason: 'end_turn' }],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 0,
      connState: 'ready',
      backgroundTasks: [],
      runtimePending: true,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    })).toBeNull()
  })

  it('全链路一致的运行与后台状态不会被历史 result 覆盖', () => {
    const input = {
      items: [{ kind: 'result', id: 'result-1', stopReason: 'end_turn' }] as ChatItem[],
      running: false,
      engineLabel: 'Codex',
      turnTokens: 800,
      connState: 'ready' as const,
      backgroundTasks: [],
      runtimePending: false,
      runtimeError: false,
      usage: USAGE,
      usageLoading: false,
    }

    expect(deriveMobileSessionStatus({
      ...input,
      runtimeState: {
        ...CONSISTENT_RUNTIME,
        effectiveStatus: 'RUNNING',
        phase: 'tool_call',
        reason: 'Agent 仍在执行工具',
      },
    })).toEqual({
      kind: 'running',
      label: 'Codex 正在运行 · 800 Token',
      detail: 'tool_call',
    })

    expect(deriveMobileSessionStatus({
      ...input,
      runtimeState: {
        ...CONSISTENT_RUNTIME,
        effectiveStatus: 'BACKGROUND_RUNNING',
        backgroundTaskCount: 2,
        reason: '子 Agent 仍在作业',
      },
    })).toEqual({
      kind: 'background',
      label: '后台任务进行中 · 2',
      detail: '子 Agent 仍在作业',
    })
  })
})

describe('MobileSessionStatus', () => {
  it('点击摘要打开详情，并从详情进入轨迹', async () => {
    getSessionRuntimeState.mockResolvedValue(CONSISTENT_RUNTIME)
    const onOpenTrajectory = vi.fn()
    const onOpenUsage = vi.fn()

    renderWithQueryClient(
      <MobileSessionStatus
        sessionId="session-1"
        items={[{ kind: 'result', id: 'result-1', stopReason: 'end_turn', latencyMs: 2_000 }]}
        running={false}
        engineLabel="Codex"
        turnTokens={0}
        connState="ready"
        backgroundTasks={[]}
        usage={USAGE}
        usageLoading={false}
        onOpenUsage={onOpenUsage}
        onOpenTrajectory={onOpenTrajectory}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '已完成 · 2s，查看运行详情' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('本轮运行详情')).toBeInTheDocument()
    expect(screen.getByText('3 轮 · 1.5千 Token')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看轨迹' }))
    expect(onOpenTrajectory).toHaveBeenCalledOnce()
  })

  it('可从运行详情进入会话用量', async () => {
    getSessionRuntimeState.mockResolvedValue(CONSISTENT_RUNTIME)
    const onOpenUsage = vi.fn()

    renderWithQueryClient(
      <MobileSessionStatus
        sessionId="session-1"
        items={[{ kind: 'result', id: 'result-1', stopReason: 'end_turn', latencyMs: 2_000 }]}
        running={false}
        engineLabel="Codex"
        turnTokens={0}
        connState="ready"
        backgroundTasks={[]}
        usage={USAGE}
        usageLoading={false}
        onOpenUsage={onOpenUsage}
        onOpenTrajectory={vi.fn()}
      />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '已完成 · 2s，查看运行详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '会话用量' }))
    expect(onOpenUsage).toHaveBeenCalledOnce()
  })
})
