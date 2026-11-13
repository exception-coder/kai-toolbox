import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BranchList } from './BranchList'

afterEach(cleanup)

it('groups repeated path segments and filters without changing the branch identity', () => {
  const select = vi.fn()
  render(<BranchList selected="" onSelect={select} branches={[
    { ref: 'refs/heads/feature/fix/feature', name: 'feature/fix/feature', head: 'abc', current: false, remote: false },
    { ref: 'refs/remotes/origin/main', name: 'origin/main', head: 'def', current: false, remote: true },
  ]} />)
  fireEvent.change(screen.getByRole('textbox', { name: '搜索分支' }), { target: { value: 'feature/fix/feature' } })
  const list = screen.getByRole('complementary', { name: '分支列表' })
  const matches = within(list).getAllByRole('button', { name: 'feature' })
  expect(matches).toHaveLength(1)
  fireEvent.click(matches[0])
  expect(select).toHaveBeenCalledExactlyOnceWith('refs/heads/feature/fix/feature')
  expect(within(list).queryByText('origin')).not.toBeInTheDocument()
})
