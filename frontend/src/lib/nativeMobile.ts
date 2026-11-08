/** Versioned, optional transport supplied only by the signed mobile host. Browser behavior stays unchanged. */
type NativeMethod = 'capabilities' | 'copyText' | 'copyImage' | 'shareImages'
interface NativeReply { id: string; ok: boolean; result?: unknown; error?: string }
interface NativeTransport {
  postMessage(message: string): void
  onmessage?: (event: { data: string }) => void
}
declare global { interface Window { ForgeNative?: NativeTransport } }

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_REQUEST_CHARS = 24 * 1024 * 1024
const pending = new Map<string, { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>()
let transport: NativeTransport | undefined

export function hasNativeMobile(): boolean {
  return typeof window !== 'undefined' && window.top === window.self && typeof window.ForgeNative?.postMessage === 'function'
}

function receive(value: unknown) {
  if (!value || typeof value !== 'object') return
  const reply = value as NativeReply
  if (typeof reply.id !== 'string' || typeof reply.ok !== 'boolean') return
  const request = pending.get(reply.id)
  if (!request) return
  clearTimeout(request.timer); pending.delete(reply.id)
  if (reply.ok) request.resolve(reply.result)
  else request.reject(new Error(reply.error || '手机操作未完成，请重试'))
}

export function callNativeMobile<T = unknown>(method: NativeMethod, payload: object = {}): Promise<T> {
  if (!hasNativeMobile()) return Promise.reject(new Error('当前未运行在 Forge 手机应用中'))
  const bridge = window.ForgeNative!
  if (transport !== bridge) {
    transport = bridge
    // Android replies on the injected object; ArkWeb replies through the scoped DOM event.
    try { bridge.onmessage = event => { try { receive(JSON.parse(event.data)) } catch { /* Ignore malformed replies. */ } } }
    catch { /* ArkWeb proxy objects may disallow adding JS properties. */ }
  }
  const id = crypto.randomUUID()
  const message = JSON.stringify({ version: 1, id, method, payload })
  if (message.length > MAX_REQUEST_CHARS) return Promise.reject(new Error('图片总量过大，请减少卡片页数后重试'))
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('手机操作结果尚未确认，请先查看系统面板，勿重复操作'))
    }, method === 'shareImages' ? 120_000 : 30_000)
    pending.set(id, { resolve: value => resolve(value as T), reject, timer })
    try { bridge.postMessage(message) } catch (error) {
      clearTimeout(timer); pending.delete(id)
      reject(error instanceof Error ? error : new Error('手机操作未完成'))
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('forge-native-result', event => receive((event as CustomEvent<unknown>).detail))
  window.addEventListener('pagehide', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer); request.reject(new Error('页面已离开，手机操作结果未确认'))
    }
    pending.clear()
  })
}

export async function nativePng(blob: Blob, name = 'forge-card.png'): Promise<{ name: string; data: string }> {
  if (blob.type !== 'image/png' || !blob.size || blob.size > MAX_IMAGE_BYTES) throw new Error('仅支持不超过 8MB 的 PNG 图片')
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result.split(',')[1]) : reject(new Error('图片读取失败'))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
  return { name, data }
}

export async function copyNativeImage(blob: Blob): Promise<void> {
  await callNativeMobile('copyImage', await nativePng(blob))
}

export async function shareNativeImages(files: File[]): Promise<'handed-off' | 'cancelled'> {
  if (!files.length || files.length > 8) throw new Error('一次可分享 1～8 张卡片图片')
  const images = []
  for (const file of files) images.push(await nativePng(file, file.name))
  const result = await callNativeMobile<{ status: string }>('shareImages', { images })
  if (result?.status === 'cancelled') return 'cancelled'
  if (result?.status !== 'handed-off') throw new Error('系统分享结果未确认，请查看手机面板')
  return 'handed-off'
}
