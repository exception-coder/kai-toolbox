import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspacePreferences } from './WorkspacePreferences'
import { useRecentSessionsExpanded } from '../lib/workspacePreferences'

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
