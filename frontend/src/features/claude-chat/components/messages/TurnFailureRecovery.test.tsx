import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { TurnFailureRecovery } from './TurnFailureRecovery'
import { latestSettledResult, resultFailure, turnResultLabel } from '../../lib/turnFailure'
import type { ChatItem, TurnFailure } from '../../types'

afterEach(cleanup)
const result = (category: TurnFailure['category']): Extract<ChatItem, { kind: 'result' }> => ({
  kind: 'result', id: 'r', stopReason: 'error', failure: { category },
})
const actions = () => ({ onDraft: vi.fn(), onContinue: vi.fn(), onConfigure: vi.fn(), onNewSession: vi.fn(),
  canContinue: true, canCompact: true })

it.each(['quota', 'context', 'authentication', 'network', 'request', 'refusal', 'limit', 'incomplete', 'unknown'] as const)(
  '%s keeps a failed result distinct from success and provides bounded recovery', category => {
    const callbacks = actions()
    render(<TurnFailureRecovery item={result(category)} actions={callbacks} />)
    expect(turnResultLabel(result(category))).toContain('此轮未完成')
    expect(screen.getByRole('status')).not.toHaveTextContent('undefined')
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0)
    expect(callbacks.onContinue).not.toHaveBeenCalled()
  })

it('compaction is advertised by engine and writes only a draft, never sends', () => {
  const callbacks = actions()
  const view = render(<TurnFailureRecovery item={result('context')} actions={{ ...callbacks, canCompact: false }} />)
  expect(screen.queryByRole('button', { name: '准备压缩指令' })).not.toBeInTheDocument()
  view.rerender(<TurnFailureRecovery item={result('context')} actions={callbacks} />)
  fireEvent.click(screen.getByRole('button', { name: '准备压缩指令' }))
  expect(callbacks.onDraft).toHaveBeenCalledExactlyOnceWith('/compact ')
  expect(callbacks.onContinue).not.toHaveBeenCalled()
})

it('continuation respects authoritative admission and retry remains a draft', () => {
  const callbacks = actions()
  const view = render(<TurnFailureRecovery item={result('limit')} actions={{ ...callbacks, canContinue: false }} />)
  fireEvent.click(screen.getByRole('button', { name: '继续处理' }))
  expect(callbacks.onContinue).not.toHaveBeenCalled()
  view.rerender(<TurnFailureRecovery item={result('limit')} actions={callbacks} />)
  fireEvent.click(screen.getByRole('button', { name: '继续处理' }))
  expect(callbacks.onContinue).toHaveBeenCalledTimes(1)
  view.rerender(<TurnFailureRecovery item={result('network')} actions={callbacks} />)
  fireEvent.click(screen.getByRole('button', { name: '准备核对与重试' }))
  expect(callbacks.onDraft).toHaveBeenCalledTimes(1)
  expect(callbacks.onContinue).toHaveBeenCalledTimes(1)
})

it('old transcripts remain unknown and recovery never targets work before a new user message', () => {
  const failed = result('quota')
  expect(resultFailure({ ...failed, failure: undefined })?.category).toBe('unknown')
  expect(resultFailure({ ...failed, stopReason: 'interrupted' })).toBeNull()
  expect(latestSettledResult([failed, { kind: 'user', id: 'new', text: 'new work' }])).toBeNull()
  expect(latestSettledResult([failed])).toBe(failed)
})
