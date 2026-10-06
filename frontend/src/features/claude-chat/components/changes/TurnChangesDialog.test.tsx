import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TurnChangesDialog, type TurnChangeRecord } from './TurnChangesDialog'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount(sessionId = 's1', turnId = '') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const close = vi.fn()
  render(<QueryClientProvider client={client}><TurnChangesDialog sessionId={sessionId} turnId={turnId} open onOpenChange={close} /></QueryClientProvider>)
  return close
}
const record: TurnChangeRecord = { turnId: 'turn-1', startedAt: 1000, endedAt: 2000, stopReason: 'end_turn', state: 'COMPLETE', warnings: [],
  repositories: [{ label: '项目', beforeHead: 'abc12345', afterHead: 'def12345', files: [{ path: '中文 file.ts', originalPath: 'old.ts', status: 'R', source: 'COMMIT_PREEXISTING' }] }] }
describe('轮次变更记录', () => {
  it('展示路径、原有修改说明和共享工作区边界，关闭不执行业务操作', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [record] }); vi.stubGlobal('fetch', fetcher)
    const close = mount('s1', 'turn-1')
    expect(await screen.findByText('中文 file.ts')).toBeInTheDocument()
    expect(screen.getByText(/开始时已有修改/)).toBeInTheDocument()
    expect(screen.getByText(/不代表本会话独占贡献/)).toBeInTheDocument()
    expect(fetcher.mock.calls[0][0]).toContain('turnId=turn-1')
    fireEvent.click(screen.getByRole('button', { name: '关闭变更记录' })); expect(close).toHaveBeenCalledWith(false)
  })
  it('新版接口未加载时可重试，旧轮次无记录不伪造', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValue({ ok: true, json: async () => [] }); vi.stubGlobal('fetch', fetcher)
    mount()
    expect(await screen.findByRole('alert')).toHaveTextContent('加载新版后端')
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(await screen.findByText(/旧轮次不会/)).toBeInTheDocument()
  })
  it('搜索限定会话并分页，不使用全局 Git 当前状态', async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => Array.from({ length: 21 }, (_, i) => ({ ...record, turnId: `turn-${i}` })) }); vi.stubGlobal('fetch', fetcher)
    mount('s2')
    await screen.findAllByText('中文 file.ts')
    fireEvent.click(screen.getByRole('button', { name: '下一页' }))
    await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('offset=20'))
    fireEvent.change(screen.getByRole('textbox', { name: '搜索变更文件或轮次' }), { target: { value: 'src/file.ts' } })
    await waitFor(() => expect(fetcher.mock.calls.at(-1)?.[0]).toContain('/sessions/s2/changes?q=src%2Ffile.ts&turnId=&offset=0'))
  })
})
