import jsQR, { type QRCode } from 'jsqr'

/** 解码结果：text 必有，若是 URL 则 url 字段不为空 */
export interface DecodeResult {
  text: string
  url: string | null
  location: QRCode['location']
}

/** jsQR 在超大图上性能很差，先缩到该上限再扫 */
const MAX_EDGE = 1600

/** 从一张 HTMLImageElement 取 ImageData 并扫描；自动按 MAX_EDGE 等比缩放 */
function scanImage(img: HTMLImageElement): DecodeResult | null {
  const sw = img.naturalWidth
  const sh = img.naturalHeight
  if (!sw || !sh) return null

  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh))
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))

  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, dw, dh)
  const data = ctx.getImageData(0, 0, dw, dh)

  const code = jsQR(data.data, data.width, data.height, { inversionAttempts: 'attemptBoth' })
  if (!code) return null

  const text = code.data
  return {
    text,
    url: looksLikeUrl(text) ? text : null,
    location: code.location,
  }
}

/** 简单判断是不是 URL：要求带 scheme（http/https/...） */
export function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return !!u.protocol && !!u.host
  } catch {
    return false
  }
}

/** 加载 File / Blob 成 HTMLImageElement */
function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/** 对外入口：从 File/Blob 解码 */
export async function decodeFromBlob(blob: Blob): Promise<DecodeResult | null> {
  const img = await loadImageFromBlob(blob)
  return scanImage(img)
}

/** 把 File/Blob 转成 data URL，用于预览 */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

/** 从粘贴事件里抽出第一张图片；不是图片返回 null */
export function pickImageFromClipboard(e: ClipboardEvent): File | null {
  const items = e.clipboardData?.items
  if (!items) return null
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      return it.getAsFile()
    }
  }
  return null
}
