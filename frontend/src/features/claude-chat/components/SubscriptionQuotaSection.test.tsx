import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchCodexHomes, fetchSubscriptionQuota } from '../api'
import type { ClaudeChatSessionView } from '../types'
import { SubscriptionQuotaSection, type QuotaContext } from './SubscriptionQuotaSection'

vi.mock('../api', () => ({ fetchCodexHomes: vi.fn(), fetchSubscriptionQuota: vi.fn() }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
beforeEach(() => { vi.mocked(fetchCodexHomes).mockResolvedValue(['home-a', 'home-b']) })
const context: QuotaContext = { id: 'a', engine: 'codex', codexHome: 'home-a', model: 'model-a' }
const quota = { available: true, shared: true, fetchedAt: Date.now(), windows: [{ windowMinutes: 10_080, remainingPercent: 63.5, resetsAt: 2_000_000_000 }, { windowMinutes: 300, remainingPercent: 90, resetsAt: null }] }
function mount(sessions?: ClaudeChatSessionView[], ctx = context) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><SubscriptionQuotaSection context={ctx} sessions={sessions} /></QueryClientProvider>)
}
const session = (extra: Partial<ClaudeChatSessionView>) => ({ ...context, lastSeenAt: 1, ...extra }) as ClaudeChatSessionView

describe('服务商订阅额度', () => {
  it('当前引擎直接展示服务商窗口、共享标识与更新时间，5 小时排在本周前', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount()
    const current = screen.getByLabelText('当前引擎 Codex')
    expect(await within(current).findByText('63.5%')).toBeInTheDocument()
    const bars = within(current).getAllByRole('progressbar')
    expect(bars.map(bar => bar.getAttribute('aria-label'))).toEqual(['5 小时剩余额度', '本周剩余额度'])
    expect(within(current).getByText(/共享额度 · 更新于/)).toBeInTheDocument()
    expect(within(current).getByText('重置时间未返回')).toBeInTheDocument()
  })

  it('未知时长的窗口按服务商时长命名，不包装成 5 小时或本周', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue({ ...quota, windows: [{ windowMinutes: 15, remainingPercent: 20, resetsAt: null }] })
    mount()
    expect(await screen.findByText('15 分钟剩余')).toBeInTheDocument()
    expect(screen.queryByText('5 小时剩余')).not.toBeInTheDocument()
    expect(screen.queryByText('本周剩余')).not.toBeInTheDocument()
  })

  it('其他引擎默认折叠且不查询，展开后才按账号获取', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount([session({}), session({ id: 'claude-official', engine: 'claude', codexHome: null })])
    await screen.findAllByText('63.5%')
    expect(fetchSubscriptionQuota).toHaveBeenCalledExactlyOnceWith('a')
    const toggle = screen.getByRole('button', { name: /Claude Code/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('展开查看')
    fireEvent.click(toggle)
    await waitFor(() => expect(fetchSubscriptionQuota).toHaveBeenCalledWith('claude-official'))
    expect(await screen.findByRole('article', { name: /Claude Code · 默认官方账号/ })).toBeInTheDocument()
  })

  it('API 账号只显示按量计费，不显示订阅窗口也不发查询', async () => {
    mount([session({ id: 'api', engine: 'claude', providerKind: 'thirdParty' })], { id: 'api', engine: 'claude', providerKind: 'thirdParty' })
    const current = screen.getByLabelText('当前引擎 Claude Code')
    expect(within(current).getByText('按量计费')).toBeInTheDocument()
    expect(within(current).queryByRole('progressbar')).not.toBeInTheDocument()
    expect(within(current).queryByText(/剩余/)).not.toBeInTheDocument()
    expect(fetchSubscriptionQuota).not.toHaveBeenCalled()
  })

  it('获取失败单独标注，可查看原因并局部重试', async () => {
    vi.mocked(fetchSubscriptionQuota).mockRejectedValueOnce(new Error('令牌已失效')).mockResolvedValueOnce(quota)
    mount()
    expect(await screen.findByText('获取失败')).toBeInTheDocument()
    expect(screen.getByText('查看失败原因')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('令牌已失效')
    fireEvent.click(screen.getByRole('button', { name: '刷新 Codex home-a 额度' }))
    expect(await screen.findByText('63.5%')).toBeInTheDocument()
    expect(screen.queryByText('获取失败')).not.toBeInTheDocument()
  })

  it('超过有效期的结果仍显示但标为数据过期', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue({ ...quota, fetchedAt: Date.now() - 30 * 60_000 })
    mount()
    expect(await screen.findByText('数据过期')).toBeInTheDocument()
    expect(screen.getByText('63.5%')).toBeInTheDocument()
  })

  it('无订阅额度的引擎不占卡片，只在说明中列出', async () => {
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount([session({}), session({ id: 'qwen', engine: 'qwen', codexHome: null })])
    await screen.findByText('63.5%')
    expect(screen.queryByRole('button', { name: /Qwen Code/ })).not.toBeInTheDocument()
    expect(screen.getByText(/无订阅额度：.*Qwen Code/)).toBeInTheDocument()
  })

  it('同一账号来源只查询一次，已删除的 Codex 授权目录不再展示', async () => {
    vi.mocked(fetchCodexHomes).mockResolvedValue(['home-a', 'C:/Users/u/.codex'])
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount([session({}), session({ id: 'same-account', lastSeenAt: 2 }), session({ id: 'removed', codexHome: 'C:/Users/u/.codex-account-pro' })])
    expect(await screen.findByText(/2 会话/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('article', { name: /codex-account-pro/ })).not.toBeInTheDocument())
    expect(fetchSubscriptionQuota).toHaveBeenCalledExactlyOnceWith('a')
  })

  it('授权目录核验失败时保留历史账号并在说明中提示', async () => {
    vi.mocked(fetchCodexHomes).mockRejectedValue(new Error('offline'))
    vi.mocked(fetchSubscriptionQuota).mockResolvedValue(quota)
    mount()
    expect(await screen.findByText(/授权目录核验失败/)).toBeInTheDocument()
    expect(await screen.findByRole('article', { name: /home-a/ })).toBeInTheDocument()
  })
})
