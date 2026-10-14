import { marked } from 'marked'

const LONG_REPLY_LENGTH = 480
const MAX_PREVIEW_LENGTH = 600
const OVERVIEW_SECTIONS = new Set(['当前状态', '关键变化', '主要修改', '主要变化', '变更', '修改内容', '验证', '验证结果'])
const ESSENTIAL_SECTIONS = new Set(['风险', '风险与限制', '注意事项', '待确认', '当前阻塞', '失败原因', '后续待办'])

/** 从原文投影摘要、变化与验证；不截断 Markdown 块，不生成结论或成功状态。 */
export function replyPreview(text: string): { preview: string; details: string } | null {
  if (text.length < LONG_REPLY_LENGTH) return null
  const tokens = marked.lexer(text)
  const sections: { label: string | null; raw: string }[] = [{ label: null, raw: '' }]
  let hasIntroduction = false
  for (const token of tokens) {
    const label = sectionLabel(token)
    if (label && hasIntroduction) sections.push({ label, raw: token.raw })
    else sections[sections.length - 1].raw += token.raw
    if (token.type !== 'space' && token.type !== 'heading' && !label) hasIntroduction = true
  }
  const introduction = sections[0].raw
  if (!hasIntroduction || introduction.length > MAX_PREVIEW_LENGTH) return null
  let preview = introduction
  let details = ''
  for (const section of sections.slice(1)) {
    const overview = OVERVIEW_SECTIONS.has(section.label ?? '')
    const essential = ESSENTIAL_SECTIONS.has(section.label ?? '')
    if (overview || essential) {
      // 关键结果或安全限制过长时保留全文，不能为了变短丢掉事实。
      if (preview.length + section.raw.length > MAX_PREVIEW_LENGTH) return null
      preview += section.raw
    } else {
      details += section.raw
    }
  }
  return details.trim().length >= 160 ? { preview, details } : null
}

function sectionLabel(token: ReturnType<typeof marked.lexer>[number]): string | null {
  if (token.type !== 'heading' && token.type !== 'paragraph') return null
  const value = typeof token.text === 'string' ? token.text.trim() : ''
  if (token.type === 'paragraph' && (value.includes('\n') || value.length > 40
    || (!value.endsWith(':') && !value.endsWith('：') && !/^\*\*.+\*\*$/.test(value)))) return null
  return value.replace(/\*\*/g, '').replace(/^\d+(?:\.\d+)*[.、\s]+/, '').replace(/[：:]$/, '').trim()
}
