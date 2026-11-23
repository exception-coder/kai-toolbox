import { useState } from 'react'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useDraftAttachments } from '../lib/attachmentDraftPref'
import { setDraftFor } from '../lib/draftPref'
import { deleteMessageSendRecord, messageRecordScope, useMessageSendRecords } from '../lib/messageSendRecords'
import { MessageCopyButton } from './MessageCopyButton'

const labels = { waiting: '送达结果待确认', accepted: '服务端已接收', queued: '服务端已保存到队列', failed: '发送或调用异常', settled: '本轮已返回结果' }

export function MessageSendRecords({ sessionId }: { sessionId?: string }) {
  const { user } = useAuth()
  const scope = messageRecordScope(user?.userId)
  const { records, error } = useMessageSendRecords(scope, sessionId)
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [, setAttachments] = useDraftAttachments(sessionId)
  if (!sessionId || (!records.length && !error)) return null
  const attention = records.filter(item => item.status === 'waiting' || item.status === 'failed').length
  return <div className="shrink-0 border-b px-3 text-xs text-muted-foreground">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="ghost" className="min-h-10 max-w-full justify-start px-1 text-xs">
        发送记录 · {records.length}{attention ? ` · ${attention} 条待核对` : ''}
      </Button></SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-lg flex-col gap-3 p-4 pt-5">
        <SheetTitle className="pr-7">本机发送记录</SheetTitle>
        <p className="text-xs leading-5 text-muted-foreground">原文保存在当前浏览器。已接收表示服务端收到请求；刷新后请结合会话状态和回复核对执行进度。恢复到输入框后，可编辑并手动发送。</p>
        {(error || actionError) && <p role="alert" className="text-sm text-destructive">{error || actionError}</p>}
        <ol className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain">
          {[...records].reverse().map(record => <li key={record.id} className="min-w-0 border-b pb-3">
            <p className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground"><span>{labels[record.status]}</span><time>{new Date(record.createdAt).toLocaleString('zh-CN')}</time></p>
            {record.note && <p className="mt-1 text-xs [overflow-wrap:anywhere]">{record.note}</p>}
            <details className="mt-2"><summary className="cursor-pointer truncate text-sm">{record.text || '附件消息'}</summary><p className="mt-2 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{record.text}</p></details>
            {record.attachments?.map(file => <p key={file.path} className="mt-1 truncate text-xs" title={file.name}>{file.name}</p>)}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <MessageCopyButton text={record.text} label="复制原文" />
              <Button variant="ghost" size="sm" className="min-h-11" onClick={() => {
                setDraftFor(sessionId, previous => previous.trim() ? `${previous}\n\n${record.text}` : record.text)
                if (record.attachments?.length) setAttachments(previous => {
                  const existing = new Set(previous.map(file => file.path))
                  return [...previous, ...record.attachments!.filter(file => !existing.has(file.path)).map(file => ({
                    id: file.path, name: file.name, path: file.path, mime: file.mime || 'application/octet-stream', size: 0,
                  }))]
                })
                setOpen(false)
              }}>恢复到输入框</Button>
              <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" onClick={() => {
                try { deleteMessageSendRecord(scope, sessionId, record.id); setActionError('') }
                catch { setActionError('删除失败，请检查浏览器存储空间。') }
              }}>删除本机记录</Button>
            </div>
          </li>)}
        </ol>
      </SheetContent>
    </Sheet>
  </div>
}
