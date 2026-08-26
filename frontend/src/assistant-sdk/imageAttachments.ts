import type { AssistantImageAttachment } from './types'

export const MAX_CLIPBOARD_IMAGES = 5
export const MAX_CLIPBOARD_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_CLIPBOARD_TOTAL_BYTES = 25 * 1024 * 1024

const SUPPORTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export function collectClipboardImages(
  clipboard: DataTransfer,
  current: readonly AssistantImageAttachment[],
): AssistantImageAttachment[] {
  const files = [...clipboard.items]
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter((file): file is File => file !== null)
  return appendImageFiles(current, files)
}

export function appendImageFiles(
  current: readonly AssistantImageAttachment[],
  files: readonly File[],
): AssistantImageAttachment[] {
  if (current.length + files.length > MAX_CLIPBOARD_IMAGES) {
    throw new Error(`每次最多发送 ${MAX_CLIPBOARD_IMAGES} 张图片`)
  }
  const additions = files.map((file, index) => toAttachment(file, current.length + index + 1))
  const totalBytes = [...current, ...additions].reduce((total, item) => total + item.size, 0)
  if (totalBytes > MAX_CLIPBOARD_TOTAL_BYTES) throw new Error('图片总大小不能超过 25MB')
  return [...current, ...additions]
}

export function attachmentPreviewUrl(attachment: AssistantImageAttachment): string {
  return URL.createObjectURL(attachment.file)
}

export function formatAttachmentSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`
}

function toAttachment(file: File, sequence: number): AssistantImageAttachment {
  const mime = file.type.toLowerCase()
  if (!SUPPORTED_IMAGE_MIME.has(mime)) throw new Error('仅支持 PNG、JPEG、GIF 或 WebP 图片')
  if (file.size <= 0) throw new Error('无法粘贴空图片')
  if (file.size > MAX_CLIPBOARD_IMAGE_BYTES) throw new Error('单张图片不能超过 10MB')
  return {
    id: createAttachmentId(),
    name: normalizedName(file.name, mime, sequence),
    mime,
    size: file.size,
    file,
  }
}

function normalizedName(name: string, mime: string, sequence: number): string {
  if (name.trim()) return name
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15)
  const extension = mime === 'image/jpeg' ? 'jpg' : mime.slice('image/'.length)
  return `clipboard-${timestamp}-${sequence}.${extension}`
}

function createAttachmentId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
