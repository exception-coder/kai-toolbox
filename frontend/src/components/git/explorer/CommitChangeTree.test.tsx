import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CommitChangeTree } from './CommitChangeTree'
import type { ReviewChange } from './api'

vi.mock('react-virtuoso', () => ({ Virtuoso: ({ data, itemContent, components }: { data: unknown[]; itemContent: (index: number, item: unknown) => React.ReactNode; components: { Footer: () => React.ReactNode } }) => <div>{data.map((item, index) => <div key={index}>{itemContent(index, item)}</div>)}<components.Footer /></div> }))
afterEach(() => { cleanup(); vi.restoreAllMocks() })
const files: ReviewChange[] = [
  { path: 'backend/customer/New.java', oldPath: null, status: 'A', x: '', y: '' },
  { path: 'backend/customer/Changed.java', oldPath: null, status: 'M', x: '', y: '' },
  { path: 'backend/visit/Deleted.java', oldPath: null, status: 'D', x: '', y: '' },
  { path: 'frontend/新文件.ts', oldPath: 'frontend/旧 文件.ts', status: 'R', x: '', y: '' },
]

it('preserves real directories and statuses, folds, filters old paths, selects a file and copies its relative path', async () => {
  const select = vi.fn(), writeText = vi.fn(async () => {})
  const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  try {
    render(<CommitChangeTree files={files} loading={false} onSelect={select} />)
    expect(screen.getByRole('button', { name: '收起 backend' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: '删除 Deleted.java' }))
    expect(select).toHaveBeenCalledWith(expect.objectContaining(files[2]))
    fireEvent.click(screen.getByRole('button', { name: '收起 backend' }))
    expect(screen.queryByRole('button', { name: '新增 New.java' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索提交文件或目录' }), { target: { value: 'customer' } })
    expect(screen.getByRole('button', { name: '新增 New.java' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'A' } })
    expect(screen.queryByRole('button', { name: '修改 Changed.java' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '旧 文件' } })
    expect(screen.getByRole('button', { name: '重命名 新文件.ts' })).toHaveAttribute('title', 'frontend/旧 文件.ts → frontend/新文件.ts')
    fireEvent.click(screen.getByRole('button', { name: '复制路径 frontend/新文件.ts' }))
    expect(await screen.findByRole('status')).toHaveTextContent('已复制路径：frontend/新文件.ts')
    expect(writeText).toHaveBeenCalledWith('frontend/新文件.ts')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'not-a-file' } })
    expect(screen.getByText('没有匹配文件，可清除筛选。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByRole('button', { name: '修改 Changed.java' })).toBeInTheDocument()
  } finally { if (original) Object.defineProperty(navigator, 'clipboard', original); else Reflect.deleteProperty(navigator, 'clipboard') }
})

it('distinguishes an unresolved file list from an empty commit and a filtered empty result', () => {
  const view = render(<CommitChangeTree files={[]} loading onSelect={vi.fn()} />)
  expect(screen.getByText(/正在读取提交文件清单/)).toBeInTheDocument()
  expect(screen.queryByText('此提交没有文件变更。')).not.toBeInTheDocument()
  view.rerender(<CommitChangeTree files={[]} loading={false} onSelect={vi.fn()} />)
  expect(screen.getByText('此提交没有文件变更。')).toBeInTheDocument()
})
