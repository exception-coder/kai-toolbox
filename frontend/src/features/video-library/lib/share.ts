import { streamUrl } from '@/features/treesize/api'
import type { VideoLibraryItem } from '../types'

/**
 * 允许走系统分享面板的文件大小上限。
 *
 * Web Share API 传的是内存里的 File —— 整个视频必须先读进 JS 堆，没有流式分享这回事。
 * 手机上超过这个量级会直接被系统 OOM 掉整个页面（不是抛异常，是页面白屏），
 * 所以宁可提前禁用并说清楚，也不让用户点完等半天再崩。
 */
export const SHARE_MAX_BYTES = 200 * 1024 * 1024

/** 分享能力的判定结果。reason 非空即不可用，值就是直接展示给用户的原因文案。 */
export interface ShareCapability {
  available: boolean
  reason: string | null
}

/**
 * 探测当前环境能不能分享视频文件。
 *
 * 三道关，缺一不可：
 * 1. 安全上下文 —— Web Share API 只在 https / localhost 下存在。手机用 http://<内网IP>
 *    访问工作台时整个 navigator.share 都不会出现。
 * 2. navigator.canShare({files}) —— 桌面 Chrome/Firefox 有 share 但不支持 files，
 *    只判断 navigator.share 存在会在桌面上给出一个点了就报错的按钮。
 * 3. 文件大小 —— 见 SHARE_MAX_BYTES。
 *
 * canShare 需要一个真实 File 才能问，所以拿一个 1 字节的假文件去探（规范允许，
 * 不会真的弹面板）。
 */
export function detectShareCapability(sizeBytes: number): ShareCapability {
  if (typeof navigator === 'undefined' || !window.isSecureContext) {
    return { available: false, reason: '当前不是安全上下文（需 https 或 localhost），浏览器不提供系统分享' }
  }
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') {
    return { available: false, reason: '当前浏览器不支持系统分享，请在手机浏览器中打开' }
  }
  try {
    const probe = new File([new Uint8Array(1)], 'probe.mp4', { type: 'video/mp4' })
    if (!navigator.canShare({ files: [probe] })) {
      return { available: false, reason: '当前浏览器不支持分享文件（桌面浏览器通常不支持），请在手机上操作' }
    }
  } catch {
    return { available: false, reason: '当前浏览器不支持分享文件' }
  }
  if (sizeBytes > SHARE_MAX_BYTES) {
    return { available: false, reason: `文件超过 ${Math.round(SHARE_MAX_BYTES / 1024 / 1024)} MB，手机内存放不下，无法分享` }
  }
  return { available: true, reason: null }
}

/** 用户在系统分享面板上点了取消 —— 不是错误，调用方应当静默处理。 */
export class ShareCancelledError extends Error {
  constructor() {
    super('用户取消了分享')
    this.name = 'ShareCancelledError'
  }
}

/**
 * 把视频读成 File 后交给系统分享面板（微信 / QQ 都在面板里）。
 *
 * 走 {@code /stream} 裸流而不是 HLS：HLS 拿到的是转码切片，拼不回一个能发出去的文件；
 * 裸流就是磁盘上的原文件字节。onProgress 用 ReadableStream 边读边报，长文件不至于
 * 让用户对着一个没有反馈的转圈发呆。
 */
export async function shareVideoFile(
  item: VideoLibraryItem,
  opts: { signal?: AbortSignal; onProgress?: (loadedBytes: number) => void } = {},
): Promise<void> {
  const res = await fetch(streamUrl(item.scanId, item.path), { signal: opts.signal })
  if (!res.ok) throw new Error(`读取视频失败：HTTP ${res.status}`)

  const contentType = res.headers.get('content-type') || 'video/mp4'
  // Content-Length 优先于库里的 size：库里的值来自上次扫描，文件可能已经变了。
  const declared = Number(res.headers.get('content-length') || item.size)
  if (declared > SHARE_MAX_BYTES) throw new Error('文件超过分享上限')

  const blob = res.body && opts.onProgress
    ? await readWithProgress(res.body, opts.onProgress)
    : await res.blob()

  const file = new File([blob], item.name, { type: contentType })
  // 二次确认：文件到手了再问一次系统，避免探测时通过、真实文件类型被拒的边缘情况。
  if (!navigator.canShare?.({ files: [file] })) {
    throw new Error('系统拒绝分享该文件类型')
  }
  try {
    await navigator.share({ files: [file], title: item.name })
  } catch (e) {
    // 用户点「取消」时各家浏览器都抛 AbortError，与真实失败区分开，否则会弹一个莫名其妙的报错框。
    if (e instanceof DOMException && e.name === 'AbortError') throw new ShareCancelledError()
    throw e
  }
}

/** 边读边累计字节数，读完拼成 Blob。 */
async function readWithProgress(
  body: ReadableStream<Uint8Array>,
  onProgress: (loadedBytes: number) => void,
): Promise<Blob> {
  const reader = body.getReader()
  const chunks: BlobPart[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      chunks.push(value as unknown as BlobPart)
      loaded += value.byteLength
      onProgress(loaded)
    }
  }
  return new Blob(chunks)
}
