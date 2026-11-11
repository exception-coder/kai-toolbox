import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SessionRuntimeState } from '../types'
import { useSessionRuntimeState } from './useSessionRuntimeState'

const getSessionRuntimeState = vi.fn()
vi.mock('../api', () => ({ getSessionRuntimeState: (...args: unknown[]) => getSessionRuntimeState(...args) }))
afterEach(() => { cleanup(); getSessionRuntimeState.mockReset() })

function snapshot(activeTurnId: string | null): SessionRuntimeState {
  return { sessionId: 's', effectiveStatus: activeTurnId ? 'RUNNING' : 'IDLE', consistency: 'CONSISTENT',
    persistedStatus: activeTurnId ? 'RUNNING' : 'IDLE', backendStatus: activeTurnId ? 'RUNNING' : 'IDLE',
    browserConnected: true, javaSidecarConnected: true, sidecarSessionPresent: true,
    sidecarActive: Boolean(activeTurnId), pendingDecision: false, backgroundTaskCount: 0,
    activeTurnId, phase: null, agentState: null, lastHeartbeatAt: 1, observedAt: 1, stale: false,
    canSend: !activeTurnId, canQueue: true, canInterrupt: Boolean(activeTurnId), reason: '', recommendedAction: '' }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('运行状态快照代次', () => {
  it('结束前的轮询晚返回时不能被当成结束后的新快照', async () => {
    const oldPoll = deferred<SessionRuntimeState>(), afterResult = deferred<SessionRuntimeState>()
    getSessionRuntimeState.mockResolvedValueOnce(snapshot('original'))
      .mockReturnValueOnce(oldPoll.promise).mockReturnValueOnce(afterResult.promise)
    const { result, rerender } = renderHook(({ running, revision }) => useSessionRuntimeState('s', running, revision), {
      wrapper: wrapper(), initialProps: { running: true, revision: 1 },
    })
    await waitFor(() => expect(result.current.data?.activeTurnId).toBe('original'))
    act(() => { void result.current.refetch() })
    await waitFor(() => expect(getSessionRuntimeState).toHaveBeenCalledTimes(2))
    const oldSignal = getSessionRuntimeState.mock.calls[1][1] as AbortSignal
    rerender({ running: false, revision: 2 })
    await waitFor(() => expect(getSessionRuntimeState).toHaveBeenCalledTimes(3))
    expect(oldSignal.aborted).toBe(true)
    await act(async () => oldPoll.resolve(snapshot('original')))
    expect(result.current.data).toBeUndefined()
    expect(result.current.isPending).toBe(true)
    await act(async () => afterResult.resolve(snapshot(null)))
    await waitFor(() => expect(result.current.data?.effectiveStatus).toBe('IDLE'))
  })

  it('结果和核对在同一批到达、running仍为true时仍切换查询', async () => {
    const old = deferred<SessionRuntimeState>(), check = deferred<SessionRuntimeState>()
    getSessionRuntimeState.mockReturnValueOnce(old.promise).mockReturnValueOnce(check.promise)
    const { result, rerender } = renderHook(({ revision }) => useSessionRuntimeState('s', true, revision), {
      wrapper: wrapper(), initialProps: { revision: 1 },
    })
    await waitFor(() => expect(getSessionRuntimeState).toHaveBeenCalledTimes(1))
    rerender({ revision: 3 })
    await waitFor(() => expect(getSessionRuntimeState).toHaveBeenCalledTimes(2))
    await act(async () => check.resolve(snapshot('check-1')))
    await waitFor(() => expect(result.current.data?.activeTurnId).toBe('check-1'))
    await act(async () => old.resolve(snapshot(null)))
    expect(result.current.data?.activeTurnId).toBe('check-1')
  })

  it('切换会话后迟到的旧会话状态不能污染当前会话', async () => {
    const old = deferred<SessionRuntimeState>()
    getSessionRuntimeState.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...snapshot(null), sessionId: 'b' })
    const { result, rerender } = renderHook(({ id }) => useSessionRuntimeState(id, false, 1), {
      wrapper: wrapper(), initialProps: { id: 'a' },
    })
    await waitFor(() => expect(getSessionRuntimeState).toHaveBeenCalledTimes(1))
    rerender({ id: 'b' })
    await waitFor(() => expect(result.current.data?.sessionId).toBe('b'))
    await act(async () => old.resolve({ ...snapshot('old'), sessionId: 'a' }))
    expect(result.current.data?.sessionId).toBe('b')
  })
})
