import { afterEach, expect, it, vi } from 'vitest'
import { callNativeMobile, hasNativeMobile, nativePng, shareNativeImages } from './nativeMobile'

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  delete window.ForgeNative
  vi.useRealTimers()
})

it('keeps ordinary browsers unchanged and refuses absent native transports', async () => {
  expect(hasNativeMobile()).toBe(false)
  await expect(callNativeMobile('copyText', { text: 'hello' })).rejects.toThrow('未运行')
})

it('correlates Android replies and ignores malformed or unrelated responses', async () => {
  let request = { id: '', version: 0, method: '', payload: {} }
  const postMessage = vi.fn(raw => { request = JSON.parse(raw) })
  window.ForgeNative = { postMessage }
  const pending = callNativeMobile('copyText', { text: '保留正文' })
  expect(request).toMatchObject({ version: 1, method: 'copyText', payload: { text: '保留正文' } })
  window.ForgeNative.onmessage!({ data: 'not json' })
  window.ForgeNative.onmessage!({ data: JSON.stringify({ id: 'unrelated', ok: true }) })
  window.ForgeNative.onmessage!({ data: JSON.stringify({ id: request.id, ok: true, result: { status: 'copied' } }) })
  await expect(pending).resolves.toEqual({ status: 'copied' })
  expect(postMessage).toHaveBeenCalledOnce()
})

it('accepts ArkWeb replies even when the proxy is not extensible', async () => {
  let id = ''
  window.ForgeNative = Object.freeze({ postMessage: (raw: string) => { id = JSON.parse(raw).id } })
  const pending = callNativeMobile('copyText', { text: '正文' })
  window.dispatchEvent(new CustomEvent('forge-native-result', { detail: { id, ok: false, error: '权限被拒绝' } }))
  await expect(pending).rejects.toThrow('权限被拒绝')
})

it('does not silently replay an unknown native operation in the browser', async () => {
  vi.useFakeTimers()
  const postMessage = vi.fn()
  window.ForgeNative = { postMessage }
  const pending = callNativeMobile('copyImage', { data: 'png' })
  const failed = expect(pending).rejects.toThrow('结果尚未确认')
  await vi.advanceTimersByTimeAsync(30_000)
  await failed
  expect(postMessage).toHaveBeenCalledOnce()
})

it('cleans pending operations on navigation and ignores late replies', async () => {
  let id = ''
  window.ForgeNative = { postMessage: raw => { id = JSON.parse(raw).id } }
  const pending = callNativeMobile('copyText', { text: 'draft' })
  window.dispatchEvent(new Event('pagehide'))
  window.dispatchEvent(new CustomEvent('forge-native-result', { detail: { id, ok: true } }))
  await expect(pending).rejects.toThrow('页面已离开')
})

it('limits image types, sizes and batch counts before posting to the host', async () => {
  const postMessage = vi.fn()
  window.ForgeNative = { postMessage }
  await expect(nativePng(new Blob(['x'], { type: 'text/plain' }))).rejects.toThrow('PNG')
  await expect(nativePng(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' }))).rejects.toThrow('8MB')
  await expect(shareNativeImages([])).rejects.toThrow('1～8')
  await expect(shareNativeImages(Array(9).fill(new File(['x'], 'x.png', { type: 'image/png' })))).rejects.toThrow('1～8')
  expect(postMessage).not.toHaveBeenCalled()
})

it('hands off every image in one call without downloading or declaring it sent', async () => {
  window.ForgeNative = { postMessage: raw => {
    const request = JSON.parse(raw)
    expect(request.method).toBe('shareImages')
    expect(request.payload.images.map((item: { name: string }) => item.name)).toEqual(['first.png', 'second.png'])
    window.ForgeNative!.onmessage!({ data: JSON.stringify({ id: request.id, ok: true, result: { status: 'handed-off' } }) })
  } }
  await expect(shareNativeImages([new File(['one'], 'first.png', { type: 'image/png' }), new File(['two'], 'second.png', { type: 'image/png' })])).resolves.toBe('handed-off')
})
