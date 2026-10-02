import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSubscriptionQuota } from '../api'
import { SubscriptionQuotaSection, type QuotaContext } from './SubscriptionQuotaSection'

vi.mock('../api', () => ({ fetchSubscriptionQuota: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
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
    expect(await screen.findByText('20%')).toBeInTheDocument()
    expect(screen.getAllByText('暂无法获取')).toHaveLength(2)
    expect(screen.getByText('15 分钟剩余')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: '刷新额度' }))
    await waitFor(() => expect(fetchSubscriptionQuota).toHaveBeenLastCalledWith('b'))
    await screen.findByText('共享额度')
  })
})
