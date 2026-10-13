import { ArrowDownToLine, ExternalLink, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CommunicationDetail } from '../../api/communicationJournal'
import { JournalImage } from './JournalImage'

export function CommunicationReader({ detail, readOnly, busy, onEdit, onRemoved, onReference }: {
  detail: CommunicationDetail; readOnly: boolean; busy: boolean
  onEdit: () => void; onRemoved: (removed: boolean) => void; onReference: () => void
}) {
  const { record, images } = detail
  return <div className="p-4">
    {record.deletedAt && <p role="status" className="mb-3 text-sm">已移除，恢复后可继续使用。</p>}
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{record.originalText || (images.length ? '图片待办' : record.title)}</p>
    {images.length > 0 && <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map(image => <JournalImage key={image.id} sessionId={record.sessionId} recordId={record.id} imageId={image.id} name={image.name} />)}</div>}
    {(record.notes || record.source || record.participants || record.sourceUrl) && <details className="mt-3 text-xs text-[var(--color-muted-foreground)]"><summary className="min-h-11 cursor-pointer py-3">旧记录补充信息</summary>
      {(record.source || record.participants) && <p>{[record.source, record.participants].filter(Boolean).join(' · ')}</p>}
      {record.notes && <p className="mt-2 whitespace-pre-wrap break-words leading-6">{record.notes}</p>}
      {record.sourceUrl && <a className="mt-2 inline-flex min-h-11 items-center gap-2 underline" href={record.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" />查看来源</a>}
    </details>}
    <div className="mt-3 flex flex-wrap gap-1 border-t pt-2">
      {!record.deletedAt && <><Button variant="ghost" className="min-h-11" disabled={readOnly || busy} onClick={onEdit}><Pencil />编辑</Button>
        <Button variant="ghost" className="min-h-11" disabled={readOnly || busy} onClick={onReference}><ArrowDownToLine />引用到草稿</Button></>}
      <Button variant="ghost" className="min-h-11" disabled={readOnly || busy} onClick={() => onRemoved(!record.deletedAt)}>
        {record.deletedAt ? <RotateCcw /> : <Trash2 />}{record.deletedAt ? '恢复记录' : '移除（可恢复）'}</Button>
    </div>
  </div>
}
