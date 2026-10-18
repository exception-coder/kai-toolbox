import { useEffect, useRef, useState } from 'react'
import { uploadAttachment } from '../api'
import { reserveDraftAttachmentSlots, useDraftAttachments, useDraftAttachmentUploads } from '../lib/attachmentDraftPref'

/** 各输入视图共用原上传接口与会话草稿，先预留名额，再逐个上传。 */
export function useComposerFileUpload({ sessionId, disabled, limit }: {
  sessionId?: string | null; disabled: boolean; limit: number
}) {
  const [, setAttachments] = useDraftAttachments(sessionId)
  const [, setUploading] = useDraftAttachmentUploads(sessionId)
  const [error, setError] = useState<string | null>(null)
  const activeSession = useRef(sessionId)
  activeSession.current = sessionId
  useEffect(() => { setError(null) }, [sessionId])

  async function uploadFiles(files: FileList | readonly File[] | null) {
    if (!files?.length) return
    if (!sessionId || disabled) { setError('当前会话暂不可上传附件，请恢复会话后重试'); return }
    const sid = sessionId
    const selected = Array.from(files)
    const count = reserveDraftAttachmentSlots(sid, selected.length, limit)
    setError(count < selected.length ? `每条消息最多 ${limit} 个附件，超出部分未上传；请移除附件或分批发送` : null)
    for (const file of selected.slice(0, count)) {
      try {
        const attachment = await uploadAttachment(sid, file)
        const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
        setAttachments(current => [...current, { ...attachment, previewUrl }])
      } catch (failure) {
        if (activeSession.current === sid) setError(current => [current,
          `${file.name}：${failure instanceof Error ? failure.message : '附件上传失败'}`].filter(Boolean).join('；'))
      } finally {
        setUploading(current => current - 1)
      }
    }
  }

  return { uploadFiles, error, clearError: () => setError(null) }
}
