import { describe, expect, it, vi } from 'vitest'
import { Blob as NativeBlob } from 'node:buffer'
import { deflateRawSync } from 'node:zlib'
import { DecompressionStream as NativeDecompressionStream } from 'node:stream/web'
import { isDrawioFile, readDrawioPages } from './drawioDocument'
import { buildDrawioFrame, DRAWIO_ASSET_PATH } from './drawioFrame'

const model = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>'

describe('draw.io 文件边界', () => {
  it('识别专用扩展名，读取原始模型及多个未压缩页面', async () => {
    expect(isDrawioFile('架构.DRAWIO')).toBe(true)
    expect(isDrawioFile('架构.drawio.xml')).toBe(true)
    expect(isDrawioFile('普通.xml')).toBe(false)
    expect(await readDrawioPages(model)).toHaveLength(1)
    const pages = await readDrawioPages(`<mxfile><diagram id="a" name="订单">${model}</diagram><diagram id="b" name="库存">${model}</diagram></mxfile>`)
    expect(pages.map(page => page.name)).toEqual(['订单', '库存'])
  })

  it('拒绝空文件、损坏 XML、其他 XML、外部实体及无图形页面', async () => {
    for (const xml of ['', '<mxfile>', '<html/>', '<mxfile/>', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><mxfile>&e;</mxfile>', '<mxGraphModel/>']) {
      await expect(readDrawioPages(xml)).rejects.toThrow()
    }
    await expect(readDrawioPages('<mxfile><diagram>损坏的压缩数据</diagram></mxfile>')).rejects.toThrow('压缩数据')
  })

  it('拒绝超大输入、过多页面和超多单元', async () => {
    await expect(readDrawioPages(' '.repeat(5 * 1024 * 1024 + 1))).rejects.toThrow('5 MiB')
    await expect(readDrawioPages(`<mxfile>${`<diagram>${model}</diagram>`.repeat(101)}</mxfile>`)).rejects.toThrow('100 页')
    await expect(readDrawioPages(`<mxGraphModel><root>${'<mxCell/>'.repeat(20_001)}</root></mxGraphModel>`)).rejects.toThrow('20000')
  })

  it('解压标准压缩页面，并在解压规模超限时中断', async () => {
    vi.stubGlobal('Blob', NativeBlob)
    vi.stubGlobal('DecompressionStream', NativeDecompressionStream)
    try {
      const encode = (xml: string) => deflateRawSync(encodeURIComponent(xml)).toString('base64')
      const pages = await readDrawioPages(`<mxfile><diagram name="压缩页">${encode(model)}</diagram></mxfile>`)
      expect(pages[0].xml).toContain('mxGraphModel')
      expect(pages[0].name).toBe('压缩页')
      const bomb = deflateRawSync(' '.repeat(20 * 1024 * 1024 + 1)).toString('base64')
      await expect(readDrawioPages(`<mxfile><diagram>${bomb}</diagram></mxfile>`)).rejects.toThrow('20 MiB')
    } finally { vi.unstubAllGlobals() }
  })

  it('隔离渲染器只加载固定本地资源，不把图形内容拼入脚本', () => {
    const html = buildDrawioFrame('https://forge.test', 'frame-token')
    expect(html).toContain(`https://forge.test${DRAWIO_ASSET_PATH}viewer-static.min.js`)
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("img-src data: blob:")
    expect(html).toContain('event.source!==parent')
    expect(html).toContain('event.origin!==host')
    expect(html).toContain('mxStencilRegistry.allowEval=false')
    expect(html).not.toContain('viewer.diagrams.net')
  })
})
