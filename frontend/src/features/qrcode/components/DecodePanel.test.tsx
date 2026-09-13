import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DecodePanel } from './DecodePanel'

afterEach(() => { cleanup(); vi.restoreAllMocks() })
it('隐藏时移除全局粘贴监听，恢复时重新注册', () => {
  const add = vi.spyOn(window, 'addEventListener')
  const remove = vi.spyOn(window, 'removeEventListener')
  const view = render(<DecodePanel active />)
  const paste = add.mock.calls.find(call => String(call[0]) === 'paste')?.[1]
  expect(paste).toBeTypeOf('function')
  view.rerender(<DecodePanel active={false} />)
  expect(remove).toHaveBeenCalledWith('paste', paste)
  const count = add.mock.calls.filter(call => String(call[0]) === 'paste').length
  view.rerender(<DecodePanel active />)
  expect(add.mock.calls.filter(call => String(call[0]) === 'paste')).toHaveLength(count + 1)
})
