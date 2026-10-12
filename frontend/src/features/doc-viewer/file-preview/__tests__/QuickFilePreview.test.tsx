import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { QuickFilePreview } from '../QuickFilePreview'
import { useBrowserDocuments } from '../useBrowserDocuments'
import { deferredFile, textFile } from './files'

vi.mock('../../lib/mermaidRenderer', () => ({ replaceMermaidBlocks: vi.fn().mockResolvedValue(undefined) }))
beforeAll(async () => { await import('../BrowserDocumentDialog') })
afterEach(cleanup)

describe('临时文件预览', () => {
  it('连续选择隔离旧读取，关闭不会被迟到结果重新打开', async () => {
    const { result } = renderHook(useBrowserDocuments)
    const old = deferredFile('旧.md')
    let pending!: Promise<void>
    act(() => { pending = result.current.openFiles([old.file]) })
    expect(result.current.reading).toBe(true)
    await act(async () => { await result.current.openFiles([textFile('新.md', '新正文')]) })
    await act(async () => { old.finish('旧正文'); await pending })
    expect(result.current.activeDocument?.content).toBe('新正文')
    const late = deferredFile('迟到.md')
    act(() => { pending = result.current.openFiles([late.file]) })
    act(() => { result.current.close() })
    await act(async () => { late.finish('迟到正文'); await pending })
    expect(result.current.open).toBe(false)
    expect(result.current.documents).toEqual([])
  })

  it('读取失败保留已有文档，不把错误伪装成新预览', async () => {
    const { result } = renderHook(useBrowserDocuments)
    await act(async () => { await result.current.openFiles([textFile('原文.md', '已打开正文')]) })
    await act(async () => { await result.current.openFiles([textFile('错误.pdf')]) })
    expect(result.current.activeDocument?.name).toBe('原文.md')
    expect(result.current.error).toContain('错误.pdf')
    expect(result.current.reading).toBe(false)
  })

  it('拖入直接渲染 Markdown 与大纲，原始文本安全展示，关闭恢复焦点', async () => {
    render(<QuickFilePreview />)
    fireEvent.drop(screen.getByRole('region', { name: '直接打开文件' }), {
      dataTransfer: { types: ['Files'], files: [textFile('说明.md', '## 章节\n\n#### 3.3.1 三级内容'), textFile('原文.txt', '<script>原始文本</script>')] },
    })
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '3.3.1 三级内容' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByRole('link', { name: '3.3.1 三级内容', hidden: true }).length).toBeGreaterThan(0))
    const chooser = screen.getByRole('combobox', { name: '切换预览文件' })
    const option = screen.getByRole('option', { name: '原文.txt' }) as HTMLOptionElement
    fireEvent.change(chooser, { target: { value: option.value } })
    expect(screen.getByText('<script>原始文本</script>')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭文件预览' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: '选择文件' })).toHaveFocus()
  })

  it('选择文件拒绝不支持格式，允许重新选择同一文件且 HTML 使用隔离框架', async () => {
    render(<QuickFilePreview />)
    const input = screen.getByLabelText('打开文档文件')
    fireEvent.change(input, { target: { files: [textFile('表格.xlsx')] } })
    expect(await screen.findByRole('alert')).toHaveTextContent('表格.xlsx')
    const prototype = textFile('原型.html', '<h1>静态原型</h1><script>alert(1)</script>')
    fireEvent.change(input, { target: { files: [prototype] } })
    const frame = await screen.findByTitle('原型.html HTML 预览')
    expect(frame).toHaveAttribute('sandbox', '')
    expect(frame.getAttribute('srcdoc')).toContain('静态原型')
    expect(frame.getAttribute('srcdoc')).not.toContain('<script>')
    fireEvent.change(input, { target: { files: [prototype] } })
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
    expect(screen.getByRole('heading', { name: '原型.html' })).toBeInTheDocument()
    const large = textFile('大文档.md', '# 大文件内容')
    Object.defineProperty(large, 'size', { value: 2 * 1024 * 1024 })
    fireEvent.change(input, { target: { files: [large] } })
    await waitFor(() => expect(screen.getByRole('button', { name: '源码' })).toHaveAttribute('aria-pressed', 'true'))
    expect(screen.getByText('# 大文件内容')).toBeInTheDocument()
  })
})
