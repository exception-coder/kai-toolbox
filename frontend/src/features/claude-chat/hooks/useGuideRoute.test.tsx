import { StrictMode } from 'react'
import { cleanup, renderHook } from '@testing-library/react'
import type { NavigateFunction } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { useGuideRoute } from './useGuideRoute'

afterEach(cleanup)

it('严格模式只消费一次，保留会话与视图，清理参数后仍可再次手动打开', () => {
  const navigate = vi.fn(), onOpen = vi.fn()
  const location = { pathname: '/tools/claude-chat', search: '?sessionId=a&view=communications&guide=1', hash: '#note' }
  const ui = renderHook(props => useGuideRoute(props, navigate as NavigateFunction, onOpen), {
    initialProps: location, wrapper: StrictMode,
  })
  expect(onOpen).toHaveBeenCalledOnce()
  expect(navigate).toHaveBeenCalledExactlyOnceWith({ ...location, search: 'sessionId=a&view=communications' }, { replace: true })
  ui.rerender({ ...location, search: '?sessionId=a&view=communications' })
  expect(onOpen).toHaveBeenCalledOnce()
  ui.rerender(location)
  expect(onOpen).toHaveBeenCalledTimes(2)
})
