import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canSteerRunningMessage, RunningMessageActions } from './RunningMessageActions'

afterEach(cleanup)

describe('running message actions', () => {
  it('offers steer only for official Codex text without attachments', () => {
    expect(canSteerRunningMessage('codex', null, 0)).toBe(true)
    expect(canSteerRunningMessage('codex', 'https://gateway.example', 0)).toBe(false)
    expect(canSteerRunningMessage('codex', null, 1)).toBe(false)
    expect(canSteerRunningMessage('claude', null, 0)).toBe(false)
  })

  it('keeps the two labeled destinations distinct', () => {
    const onSteer = vi.fn()
    const onEnqueue = vi.fn()
    render(<RunningMessageActions canSteer disabled={false} onSteer={onSteer} onEnqueue={onEnqueue} />)
    fireEvent.click(screen.getByRole('button', { name: '补充到当前轮' }))
    fireEvent.click(screen.getByRole('button', { name: '加入队列' }))
    expect(onSteer).toHaveBeenCalledOnce()
    expect(onEnqueue).toHaveBeenCalledOnce()
  })

  it('shows only queue when steer is unavailable and blocks empty input', () => {
    const onEnqueue = vi.fn()
    render(<RunningMessageActions canSteer={false} disabled onSteer={vi.fn()} onEnqueue={onEnqueue} />)
    expect(screen.queryByRole('button', { name: '补充到当前轮' })).toBeNull()
    const queue = screen.getByRole('button', { name: '加入队列' })
    expect(queue.hasAttribute('disabled')).toBe(true)
    fireEvent.click(queue)
    expect(onEnqueue).not.toHaveBeenCalled()
  })
})
