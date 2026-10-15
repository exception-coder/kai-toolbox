import { executeDocumentDesign } from './consultDocumentDesign.js'

interface DocumentContext { apiBase: string; session?: string; token?: string }
const text = (message: string, error = false): Record<string, unknown> => ({
  content: [{ type: 'text', text: message }], ...(error ? { isError: true } : {}),
})

/** 凭据来自受信任的进程环境；模型只能提交设计内容或本会话文档ID。 */
export async function callConsultDocumentTool(name: string, args: Record<string, unknown>, context: DocumentContext): Promise<Record<string, unknown>> {
  if (!context.apiBase || !context.session || !context.token) return text('当前会话未装配文档能力，请重新连接咨询后重试', true)
  if (name === 'preview_consult_document') return preview(args.documentId, args.page, context)
  const document = name === 'design_consult_document' ? await executeDocumentDesign(args.script, args.data) : args
  const body = JSON.stringify(document)
  if (body.length > 300_000) return text('文档内容超过30万字符，请拆分生成', true)
  const response = await fetch(`${context.apiBase}/api/fore-consult/document-tools/sessions/${encodeURIComponent(context.session)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Consult-Resource-Token': context.token },
    body, signal: AbortSignal.timeout(60_000),
  })
  const result = (await response.text()).slice(0, 20_000)
  if (!response.ok || name !== 'design_consult_document') return text(result, !response.ok)
  const saved = JSON.parse(result)
  let review: Record<string, unknown>
  try { review = await preview(saved.id, 1, context) }
  catch { review = text('文件已保存，预览连接失败，可继续下载或使用preview_consult_document重试；尚未完成视觉检查。', true) }
  return { content: [{ type: 'text', text: result }, ...(review.content as unknown[])],
    ...(review.isError ? { previewError: true } : {}) }
}

async function preview(id: unknown, page: unknown = 1, context: DocumentContext): Promise<Record<string, unknown>> {
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id) || !Number.isInteger(page) || Number(page) < 1 || Number(page) > 30) {
    return text('文档ID或预览起始页无效', true)
  }
  const response = await fetch(`${context.apiBase}/api/fore-consult/document-tools/sessions/${encodeURIComponent(context.session!)}/documents/${id}/preview?page=${page}`, {
    method: 'POST', headers: { 'X-Consult-Resource-Token': context.token! }, signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) return text(`预览失败：${(await response.text()).slice(0, 2000)}；不影响已保存文件，可重试，不能声称已通过视觉检查。`, true)
  const result = await response.json() as { mimeType: string; imageBase64: string; notes: string[] }
  if (result.mimeType !== 'image/png' || !/^[A-Za-z0-9+/=]+$/.test(result.imageBase64) || result.imageBase64.length > 3_000_000) {
    return text('预览返回格式无效，不能声称已通过视觉检查', true)
  }
  return { content: [{ type: 'text', text: JSON.stringify(result.notes) },
    { type: 'image', mimeType: 'image/png', data: result.imageBase64 }] }
}
