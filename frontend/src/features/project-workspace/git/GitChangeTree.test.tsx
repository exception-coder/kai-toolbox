import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GitChangeTree } from './GitChangeTree'
import { gitChangeTree } from './gitChangeTreeModel'
import type { GitWorkspace } from './api'

const files: GitWorkspace['files'] = [
  { path: 'frontend/src/one/a.ts', x: ' ', y: 'M', origPath: null },
  { path: 'frontend/src/two/b.ts', x: 'R', y: ' ', origPath: 'old/b.ts' },
  { path: 'outputs/', x: '?', y: '?', origPath: null },
]
afterEach(cleanup)
describe('Git directory hierarchy', () => {
  it('compacts single chains, keeps counts, rename origins and directory entries', () => {
    const tree = gitChangeTree(files)
    expect(tree[0].name).toBe('frontend/src')
    expect(tree[0].count).toBe(2)
    render(<GitChangeTree files={files} />)
    expect(screen.getByText('原路径：old/b.ts')).toBeInTheDocument()
    expect(screen.getByText('outputs/')).toBeInTheDocument()
    expect(screen.getByText('重命名')).toBeInTheDocument()
    expect(screen.getByText('修改')).toBeInTheDocument()
  })
  it('preserves collapse after refresh and supports expand all', async () => {
    const view = render(<GitChangeTree files={files} />)
    fireEvent.click(screen.getByRole('button', { name: '折叠全部' }))
    await waitFor(() => expect(view.container.querySelector('details')).not.toHaveAttribute('open'))
    view.rerender(<GitChangeTree files={[...files, { path: 'frontend/src/one/new.ts', x: 'A', y: ' ', origPath: null }]} />)
    expect(view.container.querySelector('details')).not.toHaveAttribute('open')
    fireEvent.click(screen.getByRole('button', { name: '展开全部' }))
    await waitFor(() => expect(view.container.querySelector('details')).toHaveAttribute('open'))
  })
  it('does not reinterpret literal backslashes or special names as properties', () => {
    const tree = gitChangeTree([{ path: '__proto__/a\\b.ts', x: '?', y: '?', origPath: null }])
    expect(tree[0].children[0].name).toBe('a\\b.ts')
  })
})
