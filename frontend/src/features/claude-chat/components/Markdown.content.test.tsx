import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Markdown } from './Markdown'
import { AssistantReply } from './messages/AssistantReply'
import { WORKBENCH_THEMES, workbenchThemeStyle } from '../lib/workbenchTheme'
import { classifyTool } from '../lib/toolKinds'
import { SideBySideDiff } from '@/components/git/SideBySideDiff'

const highlighter = vi.hoisted(() => vi.fn())
vi.mock('../lib/codeHighlight', () => ({ highlightCode: highlighter }))
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); highlighter.mockReset() })

const source = '# 开发结论\n\n## 验证范围\n\n### 细节\n\n普通正文 **关键结论** <mark>重点</mark>，`src/main.ts`、`GET /api/tasks`。\n\n- 项目\n\n> [!TIP]\n> 保留上下文\n\n| 字段 | 结果 |\n| --- | --- |\n| id | 1 |\n\n```ts title="src/main.ts"\nconst result = "<script>literal</script>";\n```'

it('retains Markdown semantics and code identity while every theme changes content tokens', () => {
  const view = render(<div data-workbench-theme="tokyo-night" style={workbenchThemeStyle('tokyo-night')}><AssistantReply text={source} /></div>)
  const heading = screen.getByRole('heading', { name: '开发结论' })
  const code = view.container.querySelector('pre code')!
  for (const theme of WORKBENCH_THEMES) {
    view.rerender(<div data-workbench-theme={theme.id} style={workbenchThemeStyle(theme.id)}><AssistantReply text={source} /></div>)
    expect(screen.getByRole('heading', { name: '开发结论' })).toBe(heading)
    expect(view.container.querySelector('pre code')).toBe(code)
    expect(view.container.querySelector('[data-reference="path"]')).toHaveTextContent('src/main.ts')
    expect(view.container.querySelector('[data-reference="api"]')).toHaveTextContent('GET /api/tasks')
    expect(view.container.querySelector('blockquote')).toHaveAttribute('data-callout', 'tip')
    expect(screen.getByRole('region', { name: '表格，可横向滚动' })).toContainElement(screen.getByRole('table'))
    expect(view.container.firstElementChild).toHaveStyle({ '--wb-heading': theme.colors[7] })
  }
  expect(code.textContent).toBe('const result = "<script>literal</script>";\n')
  expect(view.container.querySelector('script')).toBeNull()
  expect(screen.getByText('src/main.ts · ts')).toBeInTheDocument()
})

it('copies literal source, folds independently and preserves fold state across streamed text updates', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const view = render(<Markdown text={source} />)
  fireEvent.click(screen.getByRole('button', { name: '折叠代码' }))
  expect(view.container.querySelector('pre')).not.toBeVisible()
  view.rerender(<Markdown text={source + '\n\n新的正文'} />)
  expect(screen.getByRole('button', { name: '展开代码' })).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('const result = "<script>literal</script>";\n'))
  fireEvent.click(screen.getByRole('button', { name: '展开代码' }))
  expect(view.container.querySelector('pre')).toBeVisible()
})

it('ignores late highlights from an old stream and inserts tokens as literal text', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  let finish!: (value: { content: string; color: string }[][]) => void
  highlighter.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    .mockResolvedValue([[{ content: '<img onerror="bad">', color: 'var(--wb-string)' }], []])
  const view = render(<Markdown text={'```js\nold\n```'} />)
  await waitFor(() => expect(highlighter).toHaveBeenCalledOnce())
  view.rerender(<Markdown text={'```js\nnew\n```'} />)
  await waitFor(() => expect(view.container.querySelector('[data-highlighted]')).toBeInTheDocument())
  await act(async () => finish([[{ content: 'late old', color: '#fff' }]]))
  expect(view.container.querySelector('pre code')).toHaveTextContent('<img onerror="bad">')
  expect(view.container.querySelector('img')).toBeNull()
  expect(view.container.textContent).not.toContain('late old')
})

it('distinguishes write tools and annotates actual diff modifications without altering source', () => {
  for (const [name, kind] of [['Write', 'write'], ['Edit', 'edit'], ['Read', 'read'], ['Bash', 'bash'], ['Task', 'agent'], ['Skill', 'skill'], ['mcp__forge__read', 'mcp']]) expect(classifyTool(name!).kind).toBe(kind)
  const view = render(<SideBySideDiff diff={'@@ -1 +1 @@\n-old\n+new'} />)
  expect(view.container.querySelectorAll('[data-diff-modified="true"]')).toHaveLength(2)
  expect(view.container.querySelector('[data-diff-kind="removed"]')).toHaveTextContent('old')
  expect(view.container.querySelector('[data-diff-kind="added"]')).toHaveTextContent('new')
})

it('marks streaming only while text is arriving and retains the same message content node', () => {
  const view = render(<AssistantReply text="正在输出" streaming />)
  const body = view.container.querySelector('.markdown-body')
  expect(view.container.firstElementChild).toHaveAttribute('data-streaming', 'true')
  view.rerender(<AssistantReply text="正在输出" streaming={false} />)
  expect(view.container.firstElementChild).not.toHaveAttribute('data-streaming')
  expect(view.container.querySelector('.markdown-body')).toBe(body)
})

it('reports a copy failure honestly and does not carry folds into another session', async () => {
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) } })
  const execCommand = vi.fn(() => false)
  Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
  const view = render(<Markdown text={source} sessionId="first" />)
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '复制代码' })).toHaveTextContent('复制失败'))
  expect(screen.queryByText('已复制')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '折叠代码' }))
  view.rerender(<Markdown text={source} sessionId="second" />)
  expect(view.container.querySelector('pre')).toBeVisible()
  expect(screen.getByRole('button', { name: '折叠代码' })).toHaveAttribute('aria-expanded', 'true')
})
