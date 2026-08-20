export type ClarificationAnswerAttachmentKind = 'image' | 'document'

export interface ClarificationAnswerAttachment {
  id: string
  kind: ClarificationAnswerAttachmentKind
  name: string
  url: string
  markdownBody: string
  truncated: boolean
}

interface AttachmentMetadata {
  id: string
  kind: ClarificationAnswerAttachmentKind
  name: string
  url: string
  truncated: boolean
}

const ATTACHMENT_BLOCK_PATTERN = /(?:\n\n)?<!-- PRD_CLARIFICATION_ATTACHMENT ([^\s]+) -->\n([\s\S]*?)\n<!-- \/PRD_CLARIFICATION_ATTACHMENT -->/g
const ATTACHMENT_URL_PREFIX = '/api/prd-clarify/attachments/'

export function composeClarificationAnswer(
  text: string,
  attachments: ClarificationAnswerAttachment[],
): string {
  const sections = attachments.map((attachment) => {
    const metadata: AttachmentMetadata = {
      id: attachment.id,
      kind: attachment.kind,
      name: attachment.name,
      url: attachment.url,
      truncated: attachment.truncated,
    }
    return `<!-- PRD_CLARIFICATION_ATTACHMENT ${encodeURIComponent(JSON.stringify(metadata))} -->\n${attachment.markdownBody}\n<!-- /PRD_CLARIFICATION_ATTACHMENT -->`
  })
  return [text, ...sections].filter(Boolean).join('\n\n')
}

export function parseClarificationAnswer(value: string): {
  text: string
  attachments: ClarificationAnswerAttachment[]
} {
  const attachments: ClarificationAnswerAttachment[] = []
  const text = value.replace(ATTACHMENT_BLOCK_PATTERN, (_block, encodedMetadata: string, markdownBody: string) => {
    try {
      const metadata = JSON.parse(decodeURIComponent(encodedMetadata)) as AttachmentMetadata
      if (
        !metadata.id
        || !metadata.name
        || !metadata.url.startsWith(ATTACHMENT_URL_PREFIX)
        || !['image', 'document'].includes(metadata.kind)
      ) {
        return _block
      }
      attachments.push({ ...metadata, markdownBody })
      return ''
    } catch {
      return _block
    }
  })
  return { text, attachments }
}

export function createAttachmentId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function escapeMarkdownLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('[', '\\[').replaceAll(']', '\\]')
}

export function sanitizeAttachmentContent(value: string): string {
  return value.replaceAll('<!-- /PRD_CLARIFICATION_ATTACHMENT -->', '<!-- attachment marker removed -->')
}
