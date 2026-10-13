import { useEffect, useRef, useState } from 'react'
import { communicationError, uploadCommunicationImage } from '../../api/communicationJournal'
import { readJournalDraft, type JournalDraft } from './journalDraft'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const JOURNAL_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
export function journalFileIssue(files: File[], draft: JournalDraft): string | null {
  if (files.some(file => !JOURNAL_IMAGE_TYPES.has(file.type))) return '请选择 PNG、JPEG、WebP 或 GIF 截图。'
  if (files.some(file => file.size === 0) || files.reduce((size, file) => size + file.size, 0)
    + draft.images.reduce((size, image) => size + image.size, 0) > MAX_IMAGE_BYTES) return '图片不能为空，且合计不能超过 25 MiB。'
  if (files.length + draft.images.length > 10) return '一条沟通记录最多 10 张截图，请分成多条记录。'
  return null
}

export function useJournalImages(sessionId: string, userScope: string | number, options: {
  draft: JournalDraft; disabled: boolean; onChange: (value: JournalDraft) => void
}) {
  const alive = useRef(true), inFlight = useRef(false)
  const [uploading, setUploading] = useState(false), [error, setError] = useState('')
  const [previews, setPreviews] = useState<Record<string, string>>({}), previewUrls = useRef<string[]>([])
  useEffect(() => { alive.current = true; return () => {
    alive.current = false; previewUrls.current.forEach(url => URL.revokeObjectURL(url)); previewUrls.current = []
  } }, [])
  const upload = async (files: File[]) => {
    if (!files.length || inFlight.current || options.disabled) return
    const issue = journalFileIssue(files, options.draft)
    if (issue) { setError(issue); return }
    inFlight.current = true; setUploading(true); setError('')
    try {
      for (const file of files) {
        const image = await uploadCommunicationImage(sessionId, file)
        const current = readJournalDraft(sessionId, userScope)
        if (!current || current.id !== options.draft.id) break
        if (alive.current) {
          const url = URL.createObjectURL(file); previewUrls.current.push(url)
          setPreviews(value => ({ ...value, [image.id]: url }))
        }
        options.onChange({ ...current, images: [...current.images, image],
          input: { ...current.input, attachmentIds: [...current.input.attachmentIds, image.id] } })
      }
    } catch (reason) { if (alive.current) setError(communicationError(reason, true)) }
    finally { inFlight.current = false; if (alive.current) setUploading(false) }
  }
  return { uploading, error, upload, setError, previews }
}
