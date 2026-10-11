import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitStatusPanel } from './GitStatusPanel'
import type { GitStatusResponse } from './types'

afterEach(cleanup)

const response: GitStatusResponse = {
  entries: [
    { path: 'src/main.ts', x: ' ', y: 'M', origPath: null },
    { path: 'cache/output.log', x: 'M', y: ' ', origPath: null },
    { path: 'cache/keep.log', x: ' ', y: 'M', origPath: null },
  ],
  ignoredPaths: ['cache/output.log'],
}

function show(data: GitStatusResponse) {
  const fetchStatus = vi.fn().mockResolvedValue(data)
  const fetchFileDiff = vi.fn().mockResolvedValue({ diff: '', truncated: false })
  render(<GitStatusPanel title="会话目录" fetchStatus={fetchStatus} fetchFileDiff={fetchFileDiff} onClose={vi.fn()} />)
  return { fetchStatus, fetchFileDiff }
}

describe('pending changes ignore filter', () => {
  it('filters and restores the same Git result with synchronized counts and no new request', async () => {
    const { fetchStatus, fetchFileDiff } = show(response)
    const checkbox = screen.getByRole('checkbox', { name: '隐藏 Git 忽略项' })
    await screen.findByText('3 项变更')
    expect(checkbox).not.toBeChecked()
    expect(screen.getByText('output.log')).toBeInTheDocument()

    fireEvent.click(checkbox)
    expect(screen.queryByText('output.log')).toBeNull()
    expect(screen.getByText('keep.log')).toBeInTheDocument()
    expect(screen.getByText('2 项变更')).toBeInTheDocument()
    expect(screen.getByText('已隐藏 1 项')).toBeInTheDocument()

    fireEvent.click(checkbox)
    expect(screen.getByText('output.log')).toBeInTheDocument()
    expect(screen.getByText('3 项变更')).toBeInTheDocument()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
    expect(fetchFileDiff).not.toHaveBeenCalled()
  })

  it('explains a filtered empty list without claiming a clean worktree', async () => {
    show({ entries: [response.entries[1]], ignoredPaths: response.ignoredPaths })
    await screen.findByText('output.log')
    fireEvent.click(screen.getByRole('checkbox', { name: '隐藏 Git 忽略项' }))
    expect(screen.getByText('当前变更均已被过滤，取消勾选可查看。')).toBeInTheDocument()
    expect(screen.queryByText(/工作区干净/)).toBeNull()
  })

  it('keeps the filter across refresh and shows current matching metadata', async () => {
    const { fetchStatus } = show(response)
    await screen.findByText('3 项变更')
    fireEvent.click(screen.getByRole('checkbox', { name: '隐藏 Git 忽略项' }))
    fetchStatus.mockResolvedValueOnce({ ...response, ignoredPaths: [] })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(fetchStatus).toHaveBeenCalledTimes(2))
    await screen.findByText('output.log')
    expect(screen.getByRole('checkbox', { name: '隐藏 Git 忽略项' })).toBeChecked()
    expect(screen.getByText('3 项变更')).toBeInTheDocument()
    expect(screen.queryByText('已隐藏 1 项')).toBeNull()
  })

  it('keeps older server data readable and names collapsed directories', async () => {
    show({ entries: [{ path: 'outputs/', x: '?', y: '?', origPath: null }] })
    await screen.findByText('outputs/')
    expect(screen.getByRole('checkbox', { name: '隐藏 Git 忽略项' })).toBeDisabled()
    expect(screen.getByText('暂无法获取忽略规则')).toBeInTheDocument()
    expect(screen.getByText('1 项变更')).toBeInTheDocument()
  })
})
