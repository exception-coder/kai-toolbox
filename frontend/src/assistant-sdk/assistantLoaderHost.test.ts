import { afterEach, describe, expect, it, vi } from 'vitest'
import { ensureAssistantLoader, loadStableAssistantRuntime, resetAssistantLoaderForTest } from './assistantLoaderHost'

afterEach(() => {
  resetAssistantLoaderForTest()
  delete window.KaiAssistantLoader
  document.head.querySelectorAll('script[data-kai-assistant-loader]').forEach(element => element.remove())
})

describe('assistantLoaderHost', () => {
  it('复用已注册 Loader 并读取 stable 渠道', async () => {
    const load = vi.fn().mockResolvedValue({ sdk: {}, version: 'sha256-123456789abc', channel: 'stable' })
    window.KaiAssistantLoader = { load } as typeof window.KaiAssistantLoader

    const runtime = await loadStableAssistantRuntime()

    expect(runtime.version).toBe('sha256-123456789abc')
    expect(load).toHaveBeenCalledWith({ channel: 'stable' })
  })

  it('并发调用只注入一个固定 Loader 脚本', async () => {
    const first = ensureAssistantLoader()
    const second = ensureAssistantLoader()
    const script = document.head.querySelector<HTMLScriptElement>('script[data-kai-assistant-loader]')
    const loader = { load: vi.fn() }
    window.KaiAssistantLoader = loader as typeof window.KaiAssistantLoader
    script?.dispatchEvent(new Event('load'))

    await expect(first).resolves.toBe(loader)
    await expect(second).resolves.toBe(loader)
    expect(script?.getAttribute('src')).toBe('/assistant-sdk/loader.js')
    expect(document.head.querySelectorAll('script[data-kai-assistant-loader]')).toHaveLength(1)
  })

  it('脚本失败后允许下一次重新加载', async () => {
    const failed = ensureAssistantLoader()
    document.head.querySelector<HTMLScriptElement>('script[data-kai-assistant-loader]')
      ?.dispatchEvent(new Event('error'))
    await expect(failed).rejects.toThrow('Loader 加载失败')

    document.head.querySelector('script[data-kai-assistant-loader]')?.remove()
    const retried = ensureAssistantLoader()
    expect(document.head.querySelectorAll('script[data-kai-assistant-loader]')).toHaveLength(1)
    document.head.querySelector<HTMLScriptElement>('script[data-kai-assistant-loader]')
      ?.dispatchEvent(new Event('error'))
    await expect(retried).rejects.toThrow('Loader 加载失败')
  })
})
