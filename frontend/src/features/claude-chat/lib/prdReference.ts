import { getContent, getDevDocContent, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { uploadAttachment } from '../api'
import type { DraftAttachment } from './attachmentDraftPref'

export type PrdDocumentKind = 'prd' | 'dev'

/** 返回当前 PRD 记录可附加的正式文档数量。 */
export function countPrdReferenceDocuments(session: PrdSessionView): number {
  return Number(Boolean(session.mdPath)) + Number(Boolean(session.devDocPath))
}

/** 将指定 PRD 文档读取为 Markdown 文件，供所有附件入口复用。 */
export async function createPrdDocumentFile(
  session: PrdSessionView,
  kind: PrdDocumentKind,
): Promise<File> {
  const hasDocument = kind === 'prd' ? session.mdPath : session.devDocPath
  if (!hasDocument) throw new Error(kind === 'prd' ? 'PRD 文档尚未生成' : '开发文档尚未生成')
  const content = kind === 'prd' ? await getContent(session.id) : await getDevDocContent(session.id)
  if (!content.trim()) throw new Error(kind === 'prd' ? 'PRD 文档内容为空' : '开发文档内容为空')
  const suffix = kind === 'prd' ? 'PRD' : '开发文档'
  const safeTitle = (session.title || session.id).replace(/[\\/:*?"<>|]/g, '_')
  return new File([content], `${safeTitle}-${suffix}.md`, { type: 'text/markdown' })
}

/** 读取并上传一条 PRD 已生成的全部文档，全部成功后再由调用方写入草稿。 */
export async function uploadPrdReference(
  sessionId: string,
  prdSession: PrdSessionView,
): Promise<DraftAttachment[]> {
  const kinds: PrdDocumentKind[] = []
  if (prdSession.mdPath) kinds.push('prd')
  if (prdSession.devDocPath) kinds.push('dev')
  if (kinds.length === 0) throw new Error('该 PRD 尚未生成可引用文档')

  const files = await Promise.all(kinds.map(kind => createPrdDocumentFile(prdSession, kind)))
  const attachments: DraftAttachment[] = []
  for (const file of files) {
    const uploaded = await uploadAttachment(sessionId, file)
    attachments.push(uploaded)
  }
  return attachments
}
