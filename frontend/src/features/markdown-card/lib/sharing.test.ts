import { afterEach, expect, it, vi } from 'vitest'
import { captureNode } from './exporter'
import { prepareCardImages, shareCardImages } from './sharing'

vi.mock('./exporter', () => ({ captureNode: vi.fn(), buildFilename: (_mode: string, page?: number) => `card-${page ?? 1}.png` }))
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

it('prepares every slide in order and sends the complete set in one native call', async () => {
  const nodes = [document.createElement('div'), document.createElement('div')]
  vi.mocked(captureNode).mockResolvedValue('data:image/png;base64,test')
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) })))
  const share = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { share, canShare: () => true })
  const files = await prepareCardImages(nodes, 'slide', vi.fn())
  expect(files.map(file => file.name)).toEqual(['card-1.png', 'card-2.png'])
  expect(captureNode).toHaveBeenNthCalledWith(1, nodes[0])
  expect(captureNode).toHaveBeenNthCalledWith(2, nodes[1])
  expect(share).not.toHaveBeenCalled()
  const result = shareCardImages(files)
  expect(share).toHaveBeenCalledExactlyOnceWith({ files, title: 'Markdown 卡片' })
  await expect(result).resolves.toBe('handed-off')
})

it('retains unsupported or rejected images for manual retry instead of downloading', async () => {
  const files = [new File(['png'], 'card.png', { type: 'image/png' })]
  const share = vi.fn().mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
  const canShare = vi.fn(() => false)
  vi.stubGlobal('navigator', { share, canShare })
  await expect(shareCardImages(files)).rejects.toThrow('当前浏览器无法分享')
  expect(share).not.toHaveBeenCalled()
  canShare.mockReturnValue(true)
  await expect(shareCardImages(files)).rejects.toThrow('图片仍保留')
  expect(files[0].name).toBe('card.png')
})
