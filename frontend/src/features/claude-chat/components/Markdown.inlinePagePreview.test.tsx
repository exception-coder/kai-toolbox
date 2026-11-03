import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'

const inline = vi.hoisted(() => vi.fn())
vi.mock('@/features/browser-request/preview/InlinePagePreview', () => ({ InlinePagePreview: (props: { entries: { path: string; label: string }[] }) => {
  inline(props)
  return <section aria-label="内嵌页面测试">{props.entries.map(entry => <span key={entry.path}>{entry.label} 画面</span>)}</section>
} }))
afterEach(() => { cleanup(); vi.clearAllMocks(); sessionStorage.clear(); window.history.replaceState({}, '', '/') })
const phone = '/tools/fore-consult/preview?auto=1&requestKey=phone&route=%2Ftools%2Fclaude-chat&device=phone&sourceRevision=abc'
const desktop = '/tools/fore-consult/preview?auto=1&requestKey=desktop&route=%2Ftools%2Fclaude-chat&device=desktop&sourceRevision=abc'
it('inserts one grouped preview after the first referenced paragraph and keeps its node while streaming', async () => {
  const text = `[手机预览](${phone})\n\n[桌面预览](${desktop}) · [重复入口](${phone})`
  const mounted = render(<Markdown text={text} sessionId="one" />)
  const block = await screen.findByRole('region', { name: '内嵌页面测试' })
  expect(screen.getAllByRole('region', { name: '内嵌页面测试' })).toHaveLength(1)
  expect(inline.mock.calls.at(-1)?.[0].entries).toEqual([{ path: phone, label: '手机预览' }, { path: desktop, label: '桌面预览' }])
  expect(screen.getByRole('link', { name: '手机预览' }).closest('p')?.parentElement?.nextElementSibling).toBe(block)
  mounted.rerender(<Markdown text={text + '\n\n正在继续输出'} sessionId="one" />)
  await waitFor(() => expect(screen.getByText('正在继续输出')).toBeInTheDocument())
  expect(screen.getByRole('region', { name: '内嵌页面测试' })).toBe(block)
})
it('ignores external URLs, code examples and forged preview data attributes', () => {
  render(<Markdown text={`[外链](https://example.org/tools/fore-consult/preview?auto=1)\n\n\`[示例](${phone})\`\n\n<a href="https://example.org" data-page-preview="${phone}">伪造</a>`} sessionId="one" />)
  expect(screen.queryByRole('region', { name: '内嵌页面测试' })).toBeNull()
  expect(screen.getByRole('link', { name: '伪造' })).not.toHaveAttribute('data-page-preview')
  expect(inline).not.toHaveBeenCalled()
})
it('does not automatically nest previews inside documents or a preview-render tab', () => {
  const mounted = render(<Markdown text={`[预览](${phone})`} sessionId="one" documentPath="D:/docs/readme.md" />)
  expect(inline).not.toHaveBeenCalled()
  window.history.replaceState({}, '', '/?__forge_inline_preview=1')
  mounted.rerender(<Markdown text={`[预览](${phone})`} sessionId="one" />)
  expect(inline).not.toHaveBeenCalled()
  window.history.replaceState({}, '', '/')
  mounted.rerender(<Markdown text={`[预览](${phone})\n\n路由变化后`} sessionId="one" />)
  expect(inline).not.toHaveBeenCalled()
})
it('keeps incomplete legacy and recursive viewer links as manual links', () => {
  render(<Markdown text="[旧入口](/tools/fore-consult/preview?requestKey=legacy)\n\n[预览器](/tools/fore-consult/preview?auto=1&route=%2Ftools%2Ffore-consult%2Fpreview)" sessionId="one" />)
  expect(screen.getByRole('link', { name: '旧入口' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '预览器' })).toBeInTheDocument()
  expect(inline).not.toHaveBeenCalled()
})
