import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PageSkeleton } from './page-skeleton'

afterEach(() => { cleanup(); vi.useRealTimers() })

it('shows page context immediately and offers recovery after a slow load', () => {
  vi.useFakeTimers()
  render(<PageSkeleton title="业务系统咨询" />)
  expect(screen.getByRole('heading', { name: '业务系统咨询' })).toBeVisible()
  expect(screen.getByRole('region', { name: '业务系统咨询加载中' })).toHaveAttribute('aria-busy', 'true')
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(10_000))
  expect(screen.getByRole('status')).toHaveTextContent('加载比平时慢')
  expect(screen.getByRole('link', { name: '返回工作台' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('button', { name: '重新加载' })).toBeVisible()
})

it('cleans up the pending timeout when real content takes over', () => {
  vi.useFakeTimers()
  const view = render(<PageSkeleton compact />)
  view.unmount()
  expect(vi.getTimerCount()).toBe(0)
})
