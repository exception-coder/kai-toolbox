import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexHomes, fetchSubscriptionQuota } from '../api'
import { SubscriptionQuotaSection, type QuotaContext } from './SubscriptionQuotaSection'

vi.mock('../api', () => ({ fetchCodexHomes: vi.fn(), fetchSubscriptionQuota: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
beforeEach(() => { vi.mocked(fetchCodexHomes).mockResolvedValue(['home-a', 'home-b']) })
const context: QuotaContext = { id: 'a', engine: 'codex', codexHome: 'home-a', model: 'model-a' }
const quota = { available: true, shared: true, fetchedAt: 1234, windows: [{ windowMinutes: 10_080, remainingPercent: 63.5, resetsAt: 2_000_000_000 }, { windowMinutes: 300, remainingPercent: 90, resetsAt: null }] }
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><SubscriptionQuotaSection context={context} /></QueryClientProvider>)
}

describe('订阅额度', () => {
  it('展示剩余、共享标识、服务商窗口和真实获取时间', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount()
    expect(await screen.findByText('63.5%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: '5 小时剩余额度' })).toHaveAttribute('aria-valuenow', '90')
    expect(screen.getByRole('progressbar', { name: '本周剩余额度' })).toHaveAttribute('aria-valuenow', '63.5')
    expect(screen.getByText('共享额度')).toBeInTheDocument()
    expect(screen.getByText(/最后获取：/)).toHaveTextContent(new Date(1234).toLocaleString('zh-CN'))
  })

  it('未知窗口不包装成五小时或周额度', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue({ ...quota, windows: [{ windowMinutes: 15, remainingPercent: 20, resetsAt: null }] })
    mount()
    expect(await screen.findByText('15 分钟窗口剩余 20%')).toBeInTheDocument()
    expect(within(screen.getByRole('article', { name: /Codex/ })).getAllByText('暂无法获取')).toHaveLength(2)
    expect(screen.getByText('15 分钟窗口剩余 20%')).toBeInTheDocument()
  })

  it('会话切换后不显示旧账号额度，失败可重试', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValueOnce(quota).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...quota, windows: [] })
    const client = new QueryClient()
    const view = render(<QueryClientProvider client={client}><SubscriptionQuotaSection context={context} /></QueryClientProvider>)
    await screen.findByText('90%')
    view.rerender(<QueryClientProvider client={client}><SubscriptionQuotaSection context={{ ...context, id: 'b', codexHome: 'home-b' }} /></QueryClientProvider>)
    expect(screen.queryByText('90%')).not.toBeInTheDocument()
    await screen.findByRole('alert')
    expect(screen.queryByText(/最后获取：/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新全部' }))
    await waitFor(() => expect(fetchSubscriptionQuota).toHaveBeenLastCalledWith('b'))
    await screen.findByText('共享额度')
  })

  it('多账号分别显示，共享会话只查询一次，失败不挡住其他账号', async () => {
    vi.mocked(fetchSubscriptionQuota).mockImplementation(async id => {
      if (id === 'failed') throw new Error('offline')
      return quota
    })
    const sources = [
      { ...context, lastSeenAt: 1 },
      { ...context, id: 'same-account', lastSeenAt: 2 },
      { ...context, id: 'failed', codexHome: 'home-b', lastSeenAt: 3 },
      { ...context, id: 'claude-api', engine: 'claude', providerKind: 'thirdParty', lastSeenAt: 4 },
    ] as import('../types').ClaudeChatSessionView[]
    render(<QueryClientProvider client={new QueryClient()}><SubscriptionQuotaSection context={context} sessions={sources} /></QueryClientProvider>)
    expect(await screen.findByText('90%')).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('请求失败')
    expect(screen.getByText(/2 会话/)).toBeInTheDocument()
    expect(fetchSubscriptionQuota).toHaveBeenCalledTimes(2)
    expect(fetchSubscriptionQuota).not.toHaveBeenCalledWith('same-account')
    expect(fetchSubscriptionQuota).not.toHaveBeenCalledWith('claude-api')
    fireEvent.click(screen.getByRole('button', { name: '刷新 Codex home-b 额度' }))
    await waitFor(() => expect(fetchSubscriptionQuota).toHaveBeenCalledTimes(3))
  })

  it('授权目录删除后不展示历史额度行，刷新时重新核验目录', async () => {
    vi.mocked(fetchCodexHomes).mockResolvedValue(['home-a', 'C:/Users/u/.codex'])
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    const sources = [
      { ...context, lastSeenAt: 2 },
      { ...context, id: 'removed', codexHome: 'C:/Users/u/.codex-account-pro', lastSeenAt: 1 },
    ] as import('../types').ClaudeChatSessionView[]
    render(<QueryClientProvider client={new QueryClient()}><SubscriptionQuotaSection context={context} sessions={sources} /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByRole('article', { name: /codex-account-pro/ })).not.toBeInTheDocument())
    expect(await screen.findByRole('article', { name: /home-a/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '刷新全部' }))
    await waitFor(() => expect(fetchCodexHomes).toHaveBeenCalledTimes(2))
    expect(fetchSubscriptionQuota).not.toHaveBeenCalledWith('removed')
  })

  it('目录核验失败时保留历史配置并提示，不误判为已删除', async () => {
    vi.mocked(fetchCodexHomes).mockRejectedValue(new Error('offline'))
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount()
    expect(await screen.findByText(/授权目录核验失败/)).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: /home-a/ })).toBeInTheDocument()
  })
})
