import { buildFilename, captureNode } from './exporter'
import type { Mode } from '../types'
import { hasNativeMobile, shareNativeImages } from '@/lib/nativeMobile'

/** Prepare all pages without downloading; the later click retains native share activation. */
export async function prepareCardImages(nodes: HTMLElement[], mode: Mode, onProgress: (message: string) => void): Promise<File[]> {
  if (!nodes.length) throw new Error('没有可分享的卡片')
  const files: File[] = []
  for (const [index, node] of nodes.entries()) {
    onProgress(`正在生成图片 ${index + 1} / ${nodes.length}…`)
    const dataUrl = await captureNode(node)
    const response = await fetch(dataUrl)
    if (!response.ok) throw new Error('图片读取失败，请重新生成')
    files.push(new File([await response.blob()], buildFilename(mode, mode === 'slide' ? index + 1 : undefined), { type: 'image/png' }))
  }
  return files
}

export function canShareImages(files: File[]): boolean {
  if (hasNativeMobile()) return files.length > 0 && files.length <= 8 && files.every(file => file.type === 'image/png' && file.size > 0 && file.size <= 8 * 1024 * 1024)
  if (!files.length || typeof navigator === 'undefined' || typeof navigator.share !== 'function'
    || typeof navigator.canShare !== 'function') return false
  try { return navigator.canShare({ files }) } catch { return false }
}

/** Call directly in the click handler, before any asynchronous rendering or file reads. */
export async function shareCardImages(files: File[]): Promise<'handed-off' | 'cancelled'> {
  if (hasNativeMobile()) return shareNativeImages(files)
  if (!canShareImages(files)) throw new Error('当前浏览器无法分享这些图片，可换手机浏览器或使用保存 PNG')
  try {
    await navigator.share({ files, title: 'Markdown 卡片' })
    return 'handed-off'
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') return 'cancelled'
    throw new Error('系统分享未完成，图片仍保留；可重新选择应用或保存 PNG', { cause: error })
  }
}
