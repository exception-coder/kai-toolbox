import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspacePreferences } from './WorkspacePreferences'
import { useRecentSessionsExpanded } from '../lib/workspacePreferences'
import { useToolColors } from '../lib/toolColorPref'
import { useHideToolCalls } from '../lib/toolVisibilityPref'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })
function Consumer() { return <span>{useRecentSessionsExpanded() ? '最近列表展开' : '最近列表折叠'}</span> }
it('applies the browser preference to mounted consumers and survives remount', () => {
  const view = render(<><Consumer /><WorkspacePreferences open onOpenChange={() => {}} /></>)
  fireEvent.change(screen.getByLabelText('最近会话默认状态'), { target: { value: 'false' } })
  expect(screen.getByText('最近列表折叠')).toBeInTheDocument()
  view.unmount()
  render(<Consumer />)
  expect(screen.getByText('最近列表折叠')).toBeInTheDocument()
})
it('does not claim success when browser storage refuses the preference', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  render(<WorkspacePreferences open onOpenChange={() => {}} />)
  fireEvent.change(screen.getByLabelText('最近会话默认状态'), { target: { value: 'false' } })
  expect(screen.getByRole('alert')).toHaveTextContent('设置未更改')
  expect(screen.getByLabelText('最近会话默认状态')).toHaveValue('true')
})

it('groups existing settings and shares appearance preferences with mounted views', () => {
  function ReadingConsumer() { return <span>{useToolColors() ? '工具已着色' : '中性工具'} / {useHideToolCalls() ? '工具已隐藏' : '工具可见'}</span> }
  const toggleGesture = vi.fn()
  render(<><ReadingConsumer /><WorkspacePreferences open onOpenChange={() => {}} gestureEnabled={false} onToggleGesture={toggleGesture} /></>)
  for (const name of ['布局与导航', '阅读与外观', '交互偏好']) expect(screen.getByRole('region', { name })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: '工具着色' }))
  fireEvent.click(screen.getByRole('checkbox', { name: '隐藏工具调用' }))
  expect(screen.getByText('工具已着色 / 工具已隐藏')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: '手势控制' }))
  expect(toggleGesture).toHaveBeenCalledTimes(1)
})
