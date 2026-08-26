import { describe, expect, it } from 'vitest'
import {
  appendImageFiles,
  formatAttachmentSize,
  MAX_CLIPBOARD_IMAGE_BYTES,
} from './imageAttachments'

describe('image attachments', () => {
  it('normalizes unnamed clipboard images and keeps the original file in memory', () => {
    const file = new File(['image'], '', { type: 'image/png' })

    const [attachment] = appendImageFiles([], [file])

    expect(attachment.name).toMatch(/^clipboard-.*-1\.png$/)
    expect(attachment.file).toBe(file)
    expect(formatAttachmentSize(attachment.size)).toBe('1 KB')
  })

  it('rejects unsupported image types and oversized files', () => {
    expect(() => appendImageFiles([], [new File(['x'], 'screen.svg', { type: 'image/svg+xml' })]))
      .toThrow('仅支持 PNG、JPEG、GIF 或 WebP 图片')
    const oversized = new File([new Uint8Array(MAX_CLIPBOARD_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' })
    expect(() => appendImageFiles([], [oversized])).toThrow('单张图片不能超过 10MB')
  })

  it('limits a submission to five images', () => {
    const files = Array.from({ length: 6 }, (_, index) => new File(
      ['x'], `screen-${index}.png`, { type: 'image/png' },
    ))

    expect(() => appendImageFiles([], files)).toThrow('每次最多发送 5 张图片')
  })
})
