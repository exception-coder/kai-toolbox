import { describe, expect, it } from 'vitest'
import { documentKind, MAX_BROWSER_FILE_BYTES, readBrowserDocument, validateBrowserFiles } from '../browserDocument'
import { renderMarkdownToHtml } from '../../lib/renderMarkdown'
import { renderStandaloneHtml } from '../../lib/renderStandaloneHtml'
import { textFile } from './files'

describe('浏览器文档读取边界', () => {
  it('支持现有文本白名单，按格式渲染且拒绝伪扩展名', async () => {
    expect(documentKind('开发说明.MDX')).toBe('markdown')
    expect(documentKind('原型.HTM')).toBe('html')
    expect(documentKind('说明.adoc')).toBe('text')
    expect(() => documentKind('md')).toThrow('不支持')
    expect(() => validateBrowserFiles([textFile('合同.pdf')])).toThrow('不支持')
    const result = await readBrowserDocument(textFile('中文.md', '## 阅读'), 1)
    expect(result).toMatchObject({ id: 1, name: '中文.md', content: '## 阅读', kind: 'markdown' })
  })

  it('在读取前拒绝过大文件、过大批量和目录空投放', () => {
    const oversized = textFile('大文件.md')
    Object.defineProperty(oversized, 'size', { value: MAX_BROWSER_FILE_BYTES + 1 })
    expect(() => validateBrowserFiles([oversized])).toThrow('5 MiB')
    expect(() => validateBrowserFiles(Array.from({ length: 11 }, () => textFile('文件.md')))).toThrow('10 个')
    const large = Array.from({ length: 5 }, () => {
      const file = textFile('文件.md')
      Object.defineProperty(file, 'size', { value: MAX_BROWSER_FILE_BYTES })
      return file
    })
    expect(() => validateBrowserFiles(large)).toThrow('20 MiB')
    expect(() => validateBrowserFiles([])).toThrow('目录')
  })

  it('保留 UTF-16 中文及空文件，拒绝二进制和损坏编码', async () => {
    expect((await readBrowserDocument(textFile('空.md', ''), 1)).content).toBe('')
    expect((await readBrowserDocument(textFile('中文.txt', '', new Uint8Array([0xff, 0xfe, 0x2d, 0x4e])), 2)).content).toBe('中')
    await expect(readBrowserDocument(textFile('假文本.md', 'abc\0def'), 3)).rejects.toThrow('二进制')
    await expect(readBrowserDocument(textFile('损坏.md', '', new Uint8Array([0xc3, 0x28])), 4)).rejects.toThrow('编码')
    const unreadable = textFile('目录.md')
    Object.defineProperty(unreadable, 'arrayBuffer', { value: () => Promise.reject(new Error('IO')), configurable: true })
    await expect(readBrowserDocument(unreadable, 5)).rejects.toThrow('目录.md')
  })

  it('Markdown 清理脚本和样式，不把关联资源误指向当前应用，保留外链和锚点', () => {
    const html = renderMarkdownToHtml('## 章节\n[关联](./other.md)\n[外链](https://example.org/docs)\n[锚点](#section)\n![关联图片](./image.png)\n<style>body{display:none}</style><script>alert(1)</script><span style="position:fixed">正文</span>')
    const root = new DOMParser().parseFromString(html, 'text/html')
    expect(root.querySelector('script,style,[style]')).toBeNull()
    expect(root.querySelector('a[aria-disabled]')?.textContent).toBe('关联')
    expect(root.querySelector('img')?.hasAttribute('src')).toBe(false)
    expect(root.querySelector('a[href="https://example.org/docs"]')?.getAttribute('rel')).toBe('noopener noreferrer')
    expect(root.querySelector('a[href="#section"]')).not.toBeNull()
    const sourced = renderMarkdownToHtml('[关联](./other.md)', { sourceId: 'existing', currentDir: 'docs', rawBaseUrl: '/raw/' })
    expect(sourced).toContain('/tools/doc-viewer/existing/docs/other.md')
  })

  it('HTML 保留内嵌样式但删除脚本、跳转和表单，并限制资源请求', () => {
    const html = renderStandaloneHtml('<html><head><style>h1{color:red}</style><meta http-equiv="refresh" content="0;url=/api/write"><base href="/api/"></head><body><h1>原型</h1><script>fetch("/api/write")</script><form action="/api/write"></form></body></html>')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain('h1{color:red}')
    expect(html).toContain('原型')
    expect(html).not.toMatch(/<script|<form|<base|http-equiv="refresh"/i)
  })
})
