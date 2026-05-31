// 简历导出：PNG 走 html-to-image，PDF 走「打印窗口 + 系统另存为 PDF」
// 这条路径不引入额外依赖，且 PDF 与预览 100% 一致，质量取决于浏览器渲染
import { toPng } from 'html-to-image'

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

  if (!isMobileDevice()) {
    if (supportsAnchorDownload()) {
      triggerAnchorDownload(blob, filename)
      return 'downloaded'
    }
    // PC 上极旧浏览器（IE 之类）无 download 属性时的兜底
    return openInNewWindowFallback(blob)
  }

  // 移动端：先尝试系统分享
  const file = new File([blob], filename, { type: 'image/png' })
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
 * 导出为 PDF：截取完整 PNG，按 A4 高度切成 N 页放进打印窗口
 *
 * 关键点：浏览器无法在单张 <img> 内部分页，所以做法是预先算好页数，
 * 每页用一个固定 A4 高度的 .page 容器，里面同一张 img 用负 top 偏移
 * 展示对应段落，配合 page-break-after 强制分页。
 */
export async function exportAsPdf(node: HTMLElement, filename: string): Promise<void> {
  const dataUrl = await captureNode(node, 2)

  // 加载截图拿到自然尺寸，用于计算需要多少页 A4
  const img = await loadImage(dataUrl)
  const PAGE_W_MM = 210
  const PAGE_H_MM = 297
  // img 在 .page 内宽度撑满 210mm，按比例算总显示高度
  const totalHeightMm = (img.naturalHeight / img.naturalWidth) * PAGE_W_MM
  const pageCount = Math.max(1, Math.ceil(totalHeightMm / PAGE_H_MM))

  const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=900,height=1200')
  if (!printWindow) {
    throw new Error('浏览器拦截了新窗口，请允许弹窗后重试')
  }

  const pages = Array.from({ length: pageCount }, (_, i) => `
    <div class="page">
      <img class="page-img" src="${dataUrl}" style="top: -${i * PAGE_H_MM}mm;" alt="resume page ${i + 1}" />
    </div>
  `).join('')

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(filename)}</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    width: 210mm;
    height: 297mm;
    overflow: hidden;
    position: relative;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child { page-break-after: auto; break-after: auto; }
  .page-img {
    width: 210mm;
    display: block;
    position: absolute;
    left: 0;
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
${pages}
<script>
  const imgs = document.querySelectorAll('img');
  let loaded = 0;
  function check() {
    if (loaded >= imgs.length) {
      setTimeout(() => { window.focus(); window.print(); }, 120);
    }
  }
  imgs.forEach(im => {
    if (im.complete) { loaded++; check(); }
    else { im.addEventListener('load', () => { loaded++; check(); }); }
  });
  window.addEventListener('afterprint', () => window.close());
</script>
</body>
</html>`
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
