import { uploadAttachment, type UploadedAttachment } from '@/features/claude-chat/public-api'

export interface ConsultDraftAttachment {
  name: string
  path: string
  mime?: string | null
  url?: string
  file?: File
  uploadedSessionId?: string
}

export interface PreparedConsultAttachment {
  name: string
  path: string
  mime?: string
  url?: string
}

type AttachmentUploader = (sessionId: string, file: File) => Promise<UploadedAttachment>

/** 将附件逐个归属到目标 Agent 会话；失败重试时跳过已成功的同会话文件。 */
export async function prepareConsultAttachments(
  sessionId: string,
  attachments: ConsultDraftAttachment[],
  uploader: AttachmentUploader = uploadAttachment,
): Promise<PreparedConsultAttachment[]> {
  const prepared: PreparedConsultAttachment[] = []
  for (const attachment of attachments) {
    if (attachment.uploadedSessionId !== sessionId || attachment.path.startsWith('draft:')) {
      if (!attachment.file) {
        throw new Error(`附件“${attachment.name}”缺少原始文件，请重新选择`)
      }
      const uploaded = await uploader(sessionId, attachment.file)
      attachment.name = uploaded.name
      attachment.path = uploaded.path
      attachment.mime = uploaded.mime
      attachment.uploadedSessionId = sessionId
    }
    prepared.push({
      name: attachment.name,
      path: attachment.path,
      mime: attachment.mime ?? undefined,
      url: attachment.url,
    })
  }
  return prepared
}
