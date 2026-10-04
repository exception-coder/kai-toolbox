import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Database, Route } from 'lucide-react'
import { MobileSessionViewMore } from './MobileSessionViewMore'

afterEach(cleanup)

it('opens secondary views, exposes pending work and returns focus after selection', async () => {
  const onSelect = vi.fn()
  render(<MobileSessionViewMore currentView="trajectory" onSelect={onSelect} options={[
    { id: 'trajectory', label: '轨迹', icon: Route },
    { id: 'database', label: 'SQL', icon: Database, attention: true },
  ]} />)
  const trigger = screen.getByRole('button', { name: '更多会话视图，当前轨迹' })
  expect(trigger).toHaveAttribute('aria-current', 'page')
  expect(screen.getByLabelText('有待处理视图')).toBeInTheDocument()
  trigger.focus()
  fireEvent.click(trigger)
  expect(screen.getByRole('button', { name: '轨迹' })).toHaveAttribute('aria-current', 'page')
  fireEvent.click(screen.getByRole('button', { name: /SQL/ }))
  expect(onSelect).toHaveBeenCalledWith('database')
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.queryByRole('button', { name: /SQL/ })).not.toBeInTheDocument()
})
