import { authFetch } from './api'

export interface PrdAttachmentParseResult {
  fileName: string
  contentType: string
  text: string
  truncated: boolean
  fileId: string
  url: string
}

export interface PrdImageAttachmentResult {
  id: string
  name: string
  mime: string
  url: string
}

/** 上传并解析 PRD 需求附件，保留可下载的原始文件。 */
export async function parsePrdAttachment(file: File): Promise<PrdAttachmentParseResult> {
  const form = new FormData()
  form.append('file', file)
  const response = await authFetch('/prd-clarify/attachments/parse', {
    method: 'POST',
    body: form,
  })
  return parseUploadResponse<PrdAttachmentParseResult>(response, '文件解析失败')
}

/** 上传描述区粘贴的图片，返回可写入 Markdown 的访问地址。 */
export async function uploadPrdImage(file: File): Promise<PrdImageAttachmentResult> {
  const form = new FormData()
  form.append('file', file)
  const response = await authFetch('/prd-clarify/attachments/image', {
    method: 'POST',
    body: form,
  })
  return parseUploadResponse<PrdImageAttachmentResult>(response, '图片上传失败')
}

async function parseUploadResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(payload.message ?? `HTTP ${response.status}：${fallbackMessage}`)
  }
  return response.json() as Promise<T>
}
