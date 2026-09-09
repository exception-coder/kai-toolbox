import { expect, it } from 'vitest'
import { renderChatMarkdown } from '../../chatMarkdown'
import { extractRequirement, requirementPrompt, businessMessage } from './requirementDraft'
import { applyRelayEvent, initialRelayView } from './forgeRelayState'

it('accepts complete drafts but never fabricates incomplete model output', () => {
  const value = { title: '筛选', kind: '需求', summary: '筛选逾期样衣', current: '无筛选', expected: '可筛选', scope: '列表', acceptance: ['结果一致'], evidence: [], questions: ['逾期口径'] }
  expect(extractRequirement('```requirement-json\n' + JSON.stringify(value) + '\n```')).toEqual(value)
  expect(extractRequirement('```requirement-json\n{"title":"unfinished"}\n```')).toBeUndefined()
})
it('keeps business text readable while sending explicit evidence boundaries', () => {
  const prompt = requirementPrompt('BUG', '扫码出错', { systemName: '采购平台', moduleName: '询价' })
  expect(prompt).toContain('不得臆造依据')
  expect(prompt).toContain('系统：采购平台；模块：询价')
  expect(prompt).not.toContain('Yoooni One')
  expect(businessMessage(prompt)).toBe('扫码出错')
})
it('renders markdown without executable markup', () => {
  const html = renderChatMarkdown('**说明**<script>alert(1)</script><img src=x onerror=alert(1)>[链接](javascript:alert(1))')
  expect(html).toContain('<strong>说明</strong>')
  expect(html).not.toMatch(/<script|<img|onerror|href="javascript:/)
})
it('does not append a new assistant response to collapsed history', () => {
  const view = { ...initialRelayView, messages: [{ id: 'old', role: 'assistant' as const, text: '旧消息' }] }
  const result = applyRelayEvent(view, { protocolVersion: '1.0', type: 'message', seq: 1, sessionVersion: 1, occurredAt: '', data: { role: 'assistant', text: '新消息' } })
  expect(result.messages).toHaveLength(2)
  expect(result.messages[0].text).toBe('旧消息')
})
