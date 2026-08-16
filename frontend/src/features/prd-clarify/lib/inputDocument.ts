export interface RawInputAttachment {
  fileName: string
  url: string
  text: string
  truncated: boolean
}

/** 将用户输入与附件解析结果组合成可追溯的需求原文。 */
export function buildFinalRawInput(
  rawInput: string,
  attachments: readonly RawInputAttachment[],
): string {
  const normalizedInput = rawInput.trim()
  if (attachments.length === 0) return normalizedInput

  const attachmentSections = attachments.map(attachment =>
    `[📎 附件：${attachment.fileName}](${attachment.url})\n---\n` +
    `【附件：${attachment.fileName}】\n${attachment.text}` +
    `${attachment.truncated ? '\n（内容已截断）' : ''}\n---`,
  )
  return `${normalizedInput}\n\n${attachmentSections.join('\n\n')}`
}
