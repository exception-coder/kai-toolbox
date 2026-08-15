import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MobileNavigationProvider,
  useMobileNavigation,
} from './MobileNavigationContext'

function NavigationConsumer() {
  const openNavigation = useMobileNavigation()
  return (
    <button type="button" disabled={!openNavigation} onClick={() => openNavigation?.()}>
      打开移动导航
    </button>
  )
}

afterEach(cleanup)

describe('MobileNavigationContext', () => {
  it('把 Shell 持有的打开导航能力提供给 Feature', () => {
    const onOpen = vi.fn()
    render(
      <MobileNavigationProvider onOpen={onOpen}>
        <NavigationConsumer />
      </MobileNavigationProvider>,
    )

    const trigger = screen.getByRole('button', { name: '打开移动导航' })
    expect(trigger).toBeEnabled()
    fireEvent.click(trigger)
    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('脱离 Shell Provider 时安全退化为不可用能力', () => {
    render(<NavigationConsumer />)

    expect(screen.getByRole('button', { name: '打开移动导航' })).toBeDisabled()
  })
})
