// 简历导出：PNG / PDF 都走「html-to-image 截图 → 设备感知保存（移动端系统分享 / 桌面 a[download]）」
// PDF 用 jsPDF 在前端直接把截图按 A4 切页打包成真正的 PDF 文件——不开新窗口、不依赖系统打印对话框，
// 规避移动端弹窗被拦截；位图保真度与原「打印窗口」方案等价（两者都基于同一张截图）。
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

export type SaveResult = 'shared' | 'downloaded' | 'fallback'

/** 抓取节点为 PNG dataURL
 *  显式传入 scrollWidth/scrollHeight，避免 .resume-canvas 上 overflow: hidden + min-height
 *  导致 html-to-image 漏算超出 A4 的下方内容（示例数据下简历有 2-3 页 A4 高） */
export async function captureNode(node: HTMLElement, scale = 2): Promise<string> {
  await waitFonts()
  const width = node.scrollWidth
  const height = node.scrollHeight
  return toPng(node, {
    pixelRatio: scale,
    cacheBust: true,
    width,
    height,
    canvasWidth: width,
    canvasHeight: height,
    backgroundColor: getComputedStyle(node).backgroundColor || '#ffffff',
  })
}

/**
 * 保存图片：按设备类型分流。
 * - PC（桌面浏览器）：直接 a[download] 触发文件下载，不走 navigator.share。
 *   桌面端 share 体验差（弹"分享到 X"面板对桌面用户没意义），用户期望就是「下载到本地」。
 * - Mobile（手机 / 平板）：优先调起系统 share sheet，方便保存到相册 / 分享到聊天工具；
 *   不支持时退回到 a[download]；极端兜底用 window.open 让用户长按保存。
 */
export async function saveImage(dataUrl: string, filename: string): Promise<SaveResult> {
  const blob = await dataUrlToBlob(dataUrl)
  return saveBlob(blob, filename, 'image/png')
}

/**
 * 设备感知地保存任意文件 blob（PNG / PDF 共用）。
 * - PC：直接 a[download] 触发下载（桌面用户期望「下载到本地」，share 面板无意义）。
 * - Mobile：优先系统 share sheet（保存到文件 / 相册 / 分享到聊天），不支持退回 a[download]，
 *   极端兜底 window.open 让用户长按保存。
 */
export async function saveBlob(blob: Blob, filename: string, mime: string): Promise<SaveResult> {
  if (!isMobileDevice()) {
    if (supportsAnchorDownload()) {
      triggerAnchorDownload(blob, filename)
      return 'downloaded'
    }
    // PC 上极旧浏览器（IE 之类）无 download 属性时的兜底
    return openInNewWindowFallback(blob)
  }

  // 移动端：先尝试系统分享
  const file = new File([blob], filename, { type: mime })
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'shared'
      // 其他错误走下载兜底
    }
  }

  if (supportsAnchorDownload()) {
    triggerAnchorDownload(blob, filename)
    return 'downloaded'
  }

  return openInNewWindowFallback(blob)
}

function openInNewWindowFallback(blob: Blob): SaveResult {
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'fallback'
}

/**
 * 判断是否为移动设备（手机 / 平板）。
 *
 * 优先用 UA-CH 的 navigator.userAgentData.mobile（现代浏览器准确），不可用时退回 UA 字符串关键字 +
 * touch 能力探测。这种组合在 iPadOS（默认伪装桌面 UA）下也能识别（用 maxTouchPoints > 1 兜底）。
 */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false
  const navWithUaData = navigator as Navigator & {
    userAgentData?: { mobile?: boolean }
  }
  if (typeof navWithUaData.userAgentData?.mobile === 'boolean') {
    return navWithUaData.userAgentData.mobile
  }
  const ua = navigator.userAgent || ''
  if (/android|iphone|ipod|windows phone|iemobile|blackberry|mobile/i.test(ua)) {
    return true
  }
  // iPadOS 13+ 默认返回桌面 UA，要靠 touch 兜底；桌面 Chrome devtools 模拟移动时也命中
  const touchPoints = (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints ?? 0
  if (/macintosh/i.test(ua) && touchPoints > 1) return true
  return false
}

/**
 * 导出为 PDF：截取完整 PNG，用 jsPDF 按 A4 高度切成 N 页打包为真正的 PDF 文件，
 * 再走与 PNG 相同的设备感知保存（移动端系统分享 / 桌面下载）。
 *
 * 分页技巧：jsPDF 无法在单张图内部分页，故每页都贴同一张完整截图，但用负 y 偏移
 * （-i*297mm）把对应段落顶进可视区，页面外部分被 jsPDF 自动裁掉，等价于按页切片。
 */
export async function exportAsPdf(node: HTMLElement, filename: string): Promise<SaveResult> {
  const dataUrl = await captureNode(node, 2)

  // 加载截图拿到自然尺寸，用于计算需要多少页 A4
  const img = await loadImage(dataUrl)
  const PAGE_W_MM = 210
  const PAGE_H_MM = 297
  // 截图按 210mm 宽撑满，按比例算总显示高度
  const totalHeightMm = (img.naturalHeight / img.naturalWidth) * PAGE_W_MM
  const pageCount = Math.max(1, Math.ceil(totalHeightMm / PAGE_H_MM))

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  for (let i = 0; i < pageCount; i++) {
    if (i > 0) doc.addPage()
    // 同一张图，整体高度 totalHeightMm，按页用负 y 偏移上移，超出页面部分被裁掉
    doc.addImage(dataUrl, 'PNG', 0, -(i * PAGE_H_MM), PAGE_W_MM, totalHeightMm, undefined, 'FAST')
  }

  const blob = doc.output('blob')
  return saveBlob(blob, filename, 'application/pdf')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('截图加载失败'))
    img.src = src
  })
}

export function buildFilename(name: string, format: 'png' | 'pdf'): string {
  const safeName = (name || 'resume').replace(/[^\w一-龥-]+/g, '_')
  const ts = formatTimestamp(new Date())
  return `${safeName}-${ts}.${format}`
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes())
  )
}

async function waitFonts(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready
    } catch {
      // 忽略
    }
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}

function canShareFile(file: File): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
    share?: (data: ShareData) => Promise<void>
  }
  if (typeof nav.share !== 'function') return false
  if (typeof nav.canShare !== 'function') return false
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

function supportsAnchorDownload(): boolean {
  if (typeof document === 'undefined') return false
  const a = document.createElement('a')
  return 'download' in a
}

// escapeHtml 随打印窗口方案一并移除（PDF 改由 jsPDF 生成，不再拼 HTML 字符串）

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

