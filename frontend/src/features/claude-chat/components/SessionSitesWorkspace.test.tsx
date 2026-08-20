import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SessionSitesDialog, SessionSitesWorkspace } from './SessionSitesDialog'

vi.mock('@/lib/quickSites', () => ({
  listQuickSiteSummaries: vi.fn().mockResolvedValue([]),
  recordQuickSiteSummaryOpened: vi.fn(),
}))

vi.mock('../api', () => ({
  getSessionSiteConfiguration: vi.fn().mockResolvedValue({ quickSiteIds: [], customSites: [] }),
  replaceSessionSiteConfiguration: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/openQuickSite', () => ({ openQuickSite: vi.fn() }))

describe('SessionSitesWorkspace', () => {
  it('以内嵌工作区提供完整站点管理入口，不渲染弹层关闭按钮', async () => {
    render(<SessionSitesWorkspace sessionId="session-1" onChanged={vi.fn()} />)

    expect(screen.getByRole('region', { name: '会话测试站点' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '关闭站点管理' })).not.toBeInTheDocument()
    expect(await screen.findByText('快捷入口中还没有可用站点')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '添加临时站点' }))
    expect(screen.getByPlaceholderText('标题，如 ERP 入仓取消页')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('地址，可直接填写 localhost:8080/具体路径')).toBeInTheDocument()
  })

  it('保留兼容弹层的关闭能力', () => {
    const onClose = vi.fn()
    render(<SessionSitesDialog sessionId="session-1" onChanged={vi.fn()} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '关闭站点管理' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})
