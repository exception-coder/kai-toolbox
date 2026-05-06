import { toPng } from 'html-to-image'
import type { Mode } from '../types'

export type SaveResult = 'shared' | 'downloaded' | 'fallback'

export async function captureNode(node: HTMLElement, scale = 2): Promise<string> {
  await waitFonts()
  return toPng(node, {
    pixelRatio: scale,
    cacheBust: true,
    backgroundColor: getComputedStyle(node).backgroundColor || undefined,
  })
}

export async function saveImage(dataUrl: string, filename: string): Promise<SaveResult> {
  const blob = await dataUrlToBlob(dataUrl)
  const file = new File([blob], filename, { type: 'image/png' })

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        // 用户主动取消分享面板，视为已经"处理过"，不再走兜底
        return 'shared'
      }
      // 其他错误走下载兜底
    }
  }

  if (supportsAnchorDownload()) {
    triggerAnchorDownload(blob, filename)
    return 'downloaded'
  }

  // 极旧浏览器兜底：新窗口让用户长按保存
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return 'fallback'
}

export async function exportSlides(
  nodes: HTMLElement[],
  mode: Mode,
  onProgress?: (current: number, total: number) => void,
): Promise<SaveResult[]> {
  const results: SaveResult[] = []
  const total = nodes.length
  for (let i = 0; i < total; i++) {
    onProgress?.(i + 1, total)
    const dataUrl = await captureNode(nodes[i])
    const filename = buildFilename(mode, i + 1)
    const r = await saveImage(dataUrl, filename)
    results.push(r)
  }
  return results
}

export function buildFilename(mode: Mode, page?: number): string {
  const ts = formatTimestamp(new Date())
  const suffix = page != null ? `-p${page}` : ''
  return `md-card-${mode}-${ts}${suffix}.png`
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  )
}

async function waitFonts(): Promise<void> {
  if (typeof document !== 'undefined' && 'fonts' in document) {
    try {
      await document.fonts.ready
    } catch {
      // fonts.ready 异常时不阻塞导出
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
