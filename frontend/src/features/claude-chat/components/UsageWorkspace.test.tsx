import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UsagePanel, UsageWorkspace } from './UsagePanel'

vi.mock('../api', () => ({
  fetchUsage: vi.fn().mockResolvedValue([]),
}))

describe('UsageWorkspace', () => {
  it('以内嵌工作区展示会话用量，不渲染弹层关闭操作', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <UsageWorkspace session={{
          inputTokens: 1_000,
          outputTokens: 500,
          cacheReadTokens: 2_000,
          cacheCreateTokens: 100,
          totalTokens: 3_600,
          turns: 3,
        }} />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('region', { name: '会话用量' })).toBeInTheDocument()
    expect(screen.getByText('本会话用量')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭' })).not.toBeInTheDocument()
    expect(screen.getByText('总吞吐')).toBeInTheDocument()
    expect(screen.getByText('成本参照上限')).toBeInTheDocument()
    expect(await screen.findByText('尚无本地汇总数据')).toBeInTheDocument()
    expect(screen.getByText('统计口径')).toBeInTheDocument()
  })

  it('保留兼容弹层的关闭能力', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const onClose = vi.fn()
    render(
      <QueryClientProvider client={queryClient}>
        <UsagePanel onClose={onClose} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
