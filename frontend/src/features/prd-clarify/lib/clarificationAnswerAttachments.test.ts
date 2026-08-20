import { describe, expect, it } from 'vitest'
import {
  composeClarificationAnswer,
  parseClarificationAnswer,
  type ClarificationAnswerAttachment,
} from './clarificationAnswerAttachments'

const documentAttachment: ClarificationAnswerAttachment = {
  id: 'doc-1',
  kind: 'document',
  name: '报价规则.pdf',
  url: '/api/prd-clarify/attachments/file/doc-1',
  markdownBody: '### 补充资料：报价规则.pdf\n\n解析后的规则正文',
  truncated: false,
}

describe('clarification answer attachments', () => {
  it('round trips answer text and attachment blocks', () => {
    const composed = composeClarificationAnswer('按附件规则处理', [documentAttachment])
    expect(parseClarificationAnswer(composed)).toEqual({
      text: '按附件规则处理',
      attachments: [documentAttachment],
    })
  })

  it('keeps legacy plain-text answers unchanged', () => {
    expect(parseClarificationAnswer('原有回答\n第二行')).toEqual({
      text: '原有回答\n第二行',
      attachments: [],
    })
  })

  it('preserves malformed attachment markers as user text', () => {
    const malformed = '<!-- PRD_CLARIFICATION_ATTACHMENT invalid -->\n正文\n<!-- /PRD_CLARIFICATION_ATTACHMENT -->'
    expect(parseClarificationAnswer(malformed)).toEqual({ text: malformed, attachments: [] })
  })

  it('keeps untrusted attachment URLs as plain answer text', () => {
    const metadata = encodeURIComponent(JSON.stringify({
      id: 'unsafe',
      kind: 'document',
      name: 'unsafe.md',
      url: 'javascript:alert(1)',
      truncated: false,
    }))
    const value = `<!-- PRD_CLARIFICATION_ATTACHMENT ${metadata} -->\nunsafe\n<!-- /PRD_CLARIFICATION_ATTACHMENT -->`

    expect(parseClarificationAnswer(value)).toEqual({ text: value, attachments: [] })
  })

  it('preserves whitespace while an answer is being composed', () => {
    const value = '第一行\n\n'

    expect(parseClarificationAnswer(composeClarificationAnswer(value, []))).toEqual({
      text: value,
      attachments: [],
    })
  })
})
