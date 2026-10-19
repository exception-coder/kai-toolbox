import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultDayReminder, isPreviousConsultDay, readContinuationReference } from './ConsultDesktopWorkspace'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('uses Beijing calendar midnight, not elapsed 24 hours or UTC', () => {
  expect(isPreviousConsultDay(Date.parse('2026-10-18T15:59:00Z'), Date.parse('2026-10-18T16:01:00Z'))).toBe(true)
  expect(isPreviousConsultDay(Date.parse('2026-10-18T17:00:00Z'), Date.parse('2026-10-19T01:00:00Z'))).toBe(false)
  expect(isPreviousConsultDay(0)).toBe(false)
})

it('notices midnight and allows unchanged continuation without starting or archiving', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T15:59:30Z'))
  const onNew = vi.fn(), onExtend = vi.fn()
  render(<ConsultDayReminder session={{ sessionId: 'one', createdAt: Date.now() }} disabled={false} onNew={onNew} onExtend={onExtend} />)
  expect(screen.queryByRole('complementary')).toBeNull()
  act(() => vi.advanceTimersByTime(60_000))
  expect(screen.getByRole('complementary', { name: '跨天咨询提醒' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '带上旧内容新建' })); expect(onExtend).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '继续当前对话' }))
  expect(screen.queryByRole('complementary')).toBeNull(); expect(onNew).not.toHaveBeenCalled()
})

it('reads only a well-shaped durable source reference', () => {
  expect(readContinuationReference('{bad')).toBeNull()
  expect(readContinuationReference('{"continuation":{"sourceSessionId":1}}')).toBeNull()
  expect(readContinuationReference(JSON.stringify({ continuation: { sourceSessionId: 'old', sourceTitle: '库存', excerptTurnCount: 3 } })))
    .toEqual({ sourceSessionId: 'old', sourceTitle: '库存', excerptTurnCount: 3 })
})
