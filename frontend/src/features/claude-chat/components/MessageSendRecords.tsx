import { useEffect, useState } from 'react'
import { listChatSubmissions, type ChatSubmission } from '../api'
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
  const { records: localRecords, error } = useMessageSendRecords(scope, sessionId)
  const [serverRecords, setServerRecords] = useState<ChatSubmission[]>([])
  const [serverError, setServerError] = useState('')
  const [open, setOpen] = useState(false)
  const [actionError, setActionError] = useState('')
  const [, setAttachments] = useDraftAttachments(sessionId)
  useEffect(() => { setServerRecords([]); setServerError('') }, [sessionId, scope])
  useEffect(() => {
    if (!sessionId) return
    let disposed = false
    let loading = false
    const refresh = async () => {
      if (loading) return
      loading = true
      await listChatSubmissions(sessionId).then(records => {
      if (!disposed) { setServerRecords(records); setServerError('') }
      }).catch(() => { if (!disposed) setServerError('服务端记录暂时无法读取，以下本机备份不能证明接单状态。') })
      loading = false
    }
    void refresh()
    const timer = open ? setInterval(() => void refresh(), 5000) : undefined
    return () => { disposed = true; if (timer) clearInterval(timer) }
  }, [open, sessionId, scope])
  const serverIds = new Set(serverRecords.map(record => record.id))
  const statusMap = { RECEIVED: 'accepted', QUEUED: 'queued', DISPATCHED: 'accepted', COMPLETED: 'settled', FAILED: 'failed', UNKNOWN: 'waiting' } as const
  const records = [...localRecords.filter(record => !serverIds.has(record.id)), ...serverRecords.map(record => ({
    ...record, status: statusMap[record.status], note: `${record.status === 'DISPATCHED' ? '已派发引擎' : record.status === 'RECEIVED' ? '服务端已接单，准备派发' : record.status === 'QUEUED' ? '等待上一轮收尾' : '服务端记录'}${record.note ? `：${record.note}` : ''}`,
  }))].sort((a, b) => a.createdAt - b.createdAt)
  if (!sessionId) return null
  const attention = records.filter(item => item.status === 'waiting' || item.status === 'failed').length
  return <div className="shrink-0 border-b px-3 text-xs text-muted-foreground">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild><Button variant="ghost" className="min-h-10 max-w-full justify-start px-1 text-xs">
        发送记录 · {records.length}{attention ? ` · ${attention} 条待核对` : ''}
      </Button></SheetTrigger>
      <SheetContent side="right" aria-describedby={undefined} className="flex w-full max-w-lg flex-col gap-3 p-4 pt-5">
        <SheetTitle className="pr-7">发送记录</SheetTitle>
        <p className="text-xs leading-5 text-muted-foreground">显示最近 100 条服务端接单记录及本机备份。切换会话不会撤销已接单任务。重发前请核对回复及运行状态；恢复只填入草稿，不自动发送。</p>
        {(error || actionError || serverError) && <p role="alert" className="text-sm text-destructive">{error || actionError || serverError}</p>}
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
              {!serverIds.has(record.id) && <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" onClick={() => {
                try { deleteMessageSendRecord(scope, sessionId, record.id); setActionError('') }
                catch { setActionError('删除失败，请检查浏览器存储空间。') }
              }}>删除本机记录</Button>}
            </div>
          </li>)}
        </ol>
      </SheetContent>
    </Sheet>
  </div>
}
