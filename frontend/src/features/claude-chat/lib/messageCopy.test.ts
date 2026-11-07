import { expect, it } from 'vitest'
import { formatMessageCopy } from './messageCopy'

it('keeps heading hierarchy, ordered and nested lists without Markdown decoration', () => {
  const { text } = formatMessageCopy('# 方案\n\n## 范围\n\n3. **第一项**\n   - 次级项目\n4. ~~第二项~~\n\n- [x] 已完成\n- [ ] 待确认')
  expect(text).toContain('【方案】\n\n  【范围】')
  expect(text).toContain('3. 第一项\n  • 次级项目\n4. 第二项')
  expect(text).toContain('• ☑ 已完成\n• ☐ 待确认')
  expect(text).not.toMatch(/\*\*|^#/m)
})

it('keeps link destinations and reference definitions resolved', () => {
  const { text } = formatMessageCopy('查看[文档][ref]，或 <https://example.com/direct>。\n\n[ref]: https://example.com/doc?a=1&b=2')
  expect(text).toContain('文档（https://example.com/doc?a=1&b=2）')
  expect(text).toContain('https://example.com/direct')
  expect(text).not.toContain('[ref]')
})

it('retains local file destinations as text without activating application protocols', () => {
  const result = formatMessageCopy('[本地文件](D:/work/file.md) 与 [文件链接](file:///D:/work/file.sql)')
  expect(result.text).toContain('本地文件（D:/work/file.md）')
  expect(result.text).toContain('文件链接（file:///D:/work/file.sql）')
  expect(result.html).not.toContain('href=')
})

it('turns tables into readable labelled records while retaining an HTML table', () => {
  const result = formatMessageCopy('| 应用 | 状态 |\n|---|---|\n| CRM | 待确认 |\n| Agent | 完成 |')
  expect(result.text).toBe('应用：CRM；状态：待确认\n应用：Agent；状态：完成')
  expect(result.html).toContain('<table')
  expect(result.html).toContain('border-collapse')
  expect(result.html).toContain('<th')
})

it('preserves code whitespace, operators and literal tags rather than stripping them as formatting', () => {
  const code = '  const x = "<hello>";\n\n\nif (a > b && c) {\n  return "**literal**";\n}'
  const result = formatMessageCopy('说明\n\n```js\n' + code + '\n```')
  expect(result.text).toBe('说明\n\n' + code)
  expect(result.html).toContain('&lt;hello&gt;')
})

it('retains quotes and image descriptions without loading external media or unsafe HTML', () => {
  const result = formatMessageCopy('> 核对原文\n\n![示意图](https://example.com/photo.jpg)\n\n<script>alert(1)</script><img src="https://example.com/tracker" onerror="alert(2)"><a href="javascript:alert(3)">链接</a>')
  expect(result.text).toContain('引用：\n核对原文')
  expect(result.text).toContain('图片：示意图（https://example.com/photo.jpg）')
  expect(result.html).not.toMatch(/<script|<img|onerror|javascript:/i)
  expect(result.text).toContain('链接')
})

it('does not summarize, truncate or change empty content', () => {
  const long = '保持完整正文。'.repeat(10000)
  expect(formatMessageCopy(long).text).toBe(long)
  expect(formatMessageCopy('').text).toBe('')
})
