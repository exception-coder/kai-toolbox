import { expect, it } from 'vitest'
import { browserCompletionText } from './browserCompletion'

it('renders a native failure as status without claiming success or losing following text', () => {
  const marker = '::browser-complete{title="Could not connect to browser"}'
  expect(browserCompletionText(marker + '仍待验收', false, true))
    .toBe('浏览器操作状态：Could not connect to browser\n\n仍待验收')
  expect(browserCompletionText(marker + '仍待验收')).toBe('仍待验收')
  for (let i = 1; i < marker.length; i++) expect(browserCompletionText(marker.slice(0, i), true, true)).toBe('')
  const example = '```text\n' + marker + '\n```'
  expect(browserCompletionText(example, false, true)).toBe(example)
  expect(browserCompletionText('用户引用 `' + marker + '`', false, true)).toContain(marker)
})
