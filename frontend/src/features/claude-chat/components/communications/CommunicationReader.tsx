import { ArrowLeft, ArrowDownToLine, ExternalLink, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CommunicationDetail } from '../../api/communicationJournal'
import { JournalImage } from './JournalImage'

export function CommunicationReader({ detail, readOnly, busy, onBack, onEdit, onRemoved, onReference }: {
  detail: CommunicationDetail; readOnly: boolean; busy: boolean
  onBack: () => void; onEdit: () => void; onRemoved: (removed: boolean) => void; onReference: () => void
}) {
  const { record, images } = detail
  return <article className="mx-auto w-full max-w-3xl p-4 sm:p-6">
    <Button variant="ghost" className="mb-3 min-h-11 md:hidden" onClick={onBack}><ArrowLeft />返回流水列表</Button>
    <p className="text-xs text-[var(--color-muted-foreground)]">{new Date(record.occurredAt).toLocaleString()} · {record.source || '未填写来源'}{record.participants ? ` · ${record.participants}` : ''}</p>
    <h2 className="mt-2 break-words text-xl font-semibold leading-snug">{record.title}</h2>
    <div className="mt-3 flex flex-wrap gap-1 border-b pb-4">
      {!record.deletedAt && <><Button variant="outline" className="min-h-11" disabled={readOnly || busy} onClick={onReference}><ArrowDownToLine />引用到草稿</Button>
        <Button variant="ghost" className="min-h-11" disabled={readOnly || busy} onClick={onEdit}><Pencil />编辑</Button></>}
      <Button variant="ghost" className="min-h-11" disabled={readOnly || busy} onClick={() => onRemoved(!record.deletedAt)}>
        {record.deletedAt ? <RotateCcw /> : <Trash2 />}{record.deletedAt ? '恢复记录' : '移除（可恢复）'}</Button>
      {record.sourceUrl && <Button variant="ghost" className="min-h-11" asChild><a href={record.sourceUrl} target="_blank" rel="noopener noreferrer"><ExternalLink />查看来源</a></Button>}
    </div>
    {record.deletedAt && <p role="status" className="mt-4 text-sm">此记录已移除，内容仍保留；恢复后可继续引用。</p>}
    <section className="mt-6"><h3 className="text-sm font-medium">沟通原文</h3>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{record.originalText || (images.length ? '本条原始沟通保存在下方截图中。' : '未填写沟通原文。')}</p>
      {images.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">{images.map(image => <JournalImage key={image.id} sessionId={record.sessionId} recordId={record.id} imageId={image.id} name={image.name} />)}</div>}
    </section>
    <section className="mt-8 border-t pt-5"><h3 className="text-sm font-medium">用户整理备注</h3>
      <p className="mt-2 text-xs text-[var(--color-muted-foreground)]">和原文分别保留，引用时供核对。</p>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{record.notes || '还没有整理备注，可编辑补充待确认问题与结论。'}</p>
    </section>
    <p className="mt-8 break-all border-t pt-3 text-xs text-[var(--color-muted-foreground)]">更新于 {new Date(record.updatedAt).toLocaleString()} · 版本 {record.version} · {record.id}</p>
  </article>
}
