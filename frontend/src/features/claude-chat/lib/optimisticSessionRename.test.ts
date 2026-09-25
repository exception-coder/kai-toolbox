import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ClaudeChatSessionView } from '../types'
import { applyPendingSessionTitles, renameSessionOptimistically, SESSION_QUERY_KEY } from './optimisticSessionRename'

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(SESSION_QUERY_KEY, [{ id: 'one', title: '旧名称' } as ClaudeChatSessionView])
  let resolve!: () => void
  let reject!: (reason: Error) => void
  const persist = vi.fn(() => new Promise<void>((yes, no) => { resolve = yes; reject = no }))
  return { client, persist, resolve: () => resolve(), reject: (reason: Error) => reject(reason) }
}

describe('optimistic session rename', () => {
  it('updates the shared session cache before persistence and preserves the title across polling', async () => {
    const { client, persist, resolve } = setup()
    const request = renameSessionOptimistically(client, 'one', '新名称', persist)
    expect(client.getQueryData<ClaudeChatSessionView[]>(SESSION_QUERY_KEY)?.[0].title).toBe('新名称')
    expect(applyPendingSessionTitles([{ id: 'one', title: '旧名称' } as ClaudeChatSessionView])[0].title).toBe('新名称')
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    resolve()
    await request
  })

  it('rolls back on failure and ignores a repeated submit while pending', async () => {
    const { client, persist, reject } = setup()
    const request = renameSessionOptimistically(client, 'one', '新名称', persist)
    await renameSessionOptimistically(client, 'one', '新名称', persist)
    await vi.waitFor(() => expect(persist).toHaveBeenCalledOnce())
    reject(new Error('保存失败'))
    await expect(request).rejects.toThrow('保存失败')
    expect(client.getQueryData<ClaudeChatSessionView[]>(SESSION_QUERY_KEY)?.[0].title).toBe('旧名称')
  })
})
