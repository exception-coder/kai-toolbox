import type { PropsWithChildren } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceModuleSync } from './useWorkspaceModuleSync'

const apiMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  apply: vi.fn(),
}))

vi.mock('@/features/claude-chat/public-api', () => ({
  previewModuleSync: apiMocks.preview,
  applyModuleSync: apiMocks.apply,
}))

function renderModuleSync(onApplied = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { ...renderHook(() => useWorkspaceModuleSync('D:/repo', onApplied), { wrapper }), onApplied }
}

describe('useWorkspaceModuleSync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('预览后维护选择，并在追加成功时关闭面板和通知刷新', async () => {
    apiMocks.preview.mockResolvedValue({ added: [], missing: [] })
    apiMocks.apply.mockResolvedValue({ appended: 2, skipped: 1 })
    const { result, onApplied } = renderModuleSync()

    act(() => result.current.start())
    await waitFor(() => expect(result.current.preview.isSuccess).toBe(true))
    expect(result.current.open).toBe(true)

    act(() => {
      result.current.toggle('module-a')
      result.current.apply.mutate([{ key: 'module-a', codePath: 'module-a' }])
    })
    await waitFor(() => expect(result.current.apply.isSuccess).toBe(true))

    expect(apiMocks.preview).toHaveBeenCalledWith('D:/repo')
    expect(apiMocks.apply).toHaveBeenCalledWith('D:/repo', [{ key: 'module-a', codePath: 'module-a' }])
    expect(result.current.message).toBe('已追加 2 个模块（跳过 1）')
    expect(result.current.open).toBe(false)
    expect(onApplied).toHaveBeenCalledOnce()
  })

  it('保留预览失败状态供面板展示恢复入口', async () => {
    apiMocks.preview.mockRejectedValue(new Error('扫描失败'))
    const { result } = renderModuleSync()

    act(() => result.current.start())
    await waitFor(() => expect(result.current.preview.isError).toBe(true))

    expect(result.current.open).toBe(true)
    expect(result.current.preview.error).toEqual(new Error('扫描失败'))
  })
})
