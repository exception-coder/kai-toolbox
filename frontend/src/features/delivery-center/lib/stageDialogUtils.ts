export interface SourceFile {
  name: string
  url: string
}

export function extractSourceFiles(rawInput: string, attachmentField: string): SourceFile[] {
  const files: SourceFile[] = []
  const markdownLink = /\[([^\]]+)]\((\/api\/prd-clarify\/attachments\/file\/[^)\s]+)\)/g
  for (const source of [rawInput, attachmentField]) {
    let match: RegExpExecArray | null
    while ((match = markdownLink.exec(source)) !== null) {
      files.push({ name: match[1].replace(/^📎\s*/, ''), url: match[2] })
    }
  }
  return files.filter((file, index) => files.findIndex(item => item.url === file.url) === index)
}

export function parseTddQuestions(raw: string): string[] {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.includes('[CLARIFICATION_COMPLETE]')) return []
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = withoutFence.indexOf('[')
  const end = withoutFence.lastIndexOf(']')
  if (start < 0 || end < start) throw new Error('AI 未返回有效的问题列表，请重新生成')

  let parsed: unknown
  try {
    parsed = JSON.parse(withoutFence.slice(start, end + 1))
  } catch {
    throw new Error('AI 返回的问题 JSON 无法解析，请重新生成')
  }
  if (!Array.isArray(parsed)) throw new Error('AI 返回的问题格式不正确，请重新生成')
  const questions = parsed
    .map(item => {
      if (typeof item === 'string') return item.trim()
      if (typeof item === 'object' && item && 'question' in item) {
        const question = (item as { question?: unknown }).question
        return typeof question === 'string' ? question.trim() : ''
      }
      return ''
    })
    .filter((question): question is string => !!question)
    .filter((question, index, all) => all.indexOf(question) === index)
    .slice(0, 5)

  if (parsed.length > 0 && questions.length === 0) {
    throw new Error('AI 返回的问题内容为空，请重新生成')
  }
  return questions
}

export function eventMessage(data: unknown, fallback: string) {
  if (typeof data === 'object' && data && 'message' in data) {
    const message = (data as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return fallback
}

export function messageOf(cause: unknown, fallback: string) {
  return cause instanceof Error && cause.message ? cause.message : fallback
}

