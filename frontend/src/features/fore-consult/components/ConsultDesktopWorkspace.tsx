import { useEffect, useState } from 'react'
import { History, Maximize2, MessagesSquare, Minimize2, MoreHorizontal, Plus, Route } from 'lucide-react'
import type { ConsultSessionView } from '../api'
import './consult-desktop-workspace.css'

const consultationDate = (value: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit' }).format(value)

export function isPreviousConsultDay(createdAt: number, now = Date.now()) {
  return createdAt > 0 && consultationDate(createdAt) < consultationDate(now)
}

export interface ConsultContinuationReference {
  sourceSessionId: string
  sourceTitle: string
  excerptTurnCount: number
}

export function readContinuationReference(snapshot: string | null | undefined): ConsultContinuationReference | null {
  if (!snapshot) return null
  try {
    const reference = (JSON.parse(snapshot) as { continuation?: ConsultContinuationReference }).continuation
    return reference && typeof reference.sourceSessionId === 'string' && typeof reference.sourceTitle === 'string'
      && typeof reference.excerptTurnCount === 'number' ? reference : null
  } catch { return null }
}

export function ConsultDesktopHeader({ title, disabled, hasSession, draftOpen, graphOpen, toolsOpen,
  onNew, onContinue, onExtend, onHistory, onGraph, onTools, expanded = false, onExpand }: {
  title: string; disabled: boolean; hasSession: boolean; draftOpen: boolean; graphOpen: boolean; toolsOpen: boolean
  onNew: () => void; onContinue: () => void; onExtend: () => void; onHistory: () => void
  onGraph: () => void; onTools: () => void; expanded?: boolean; onExpand?: () => void
}) {
  return <div className="fc-desktop-header">
    <div className="fc-desktop-heading"><MessagesSquare className="size-4" /><strong>业务咨询</strong><span>{title}</span></div>
    <nav aria-label="咨询操作">
      <button type="button" disabled={disabled} onClick={onNew}><Plus className="size-4" />新建咨询</button>
      {hasSession && <>
        {draftOpen && !graphOpen && <button type="button" onClick={onContinue}>返回当前咨询</button>}
        <button type="button" disabled={disabled} onClick={onExtend}>延续新建</button>
      </>}
      <button type="button" onClick={onHistory}><History className="size-4" />历史咨询</button>
      <button type="button" aria-pressed={graphOpen} onClick={onGraph}><Route className="size-4" />{graphOpen ? '返回对话' : '系统图谱'}</button>
      {!graphOpen && onExpand && <button type="button" aria-label={expanded ? '还原对话窗口' : '展开对话窗口'} aria-pressed={expanded} onClick={onExpand}>
        {expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
      </button>}
      <button type="button" aria-label="更多咨询设置" aria-expanded={toolsOpen} aria-controls="fc-consult-tools" onClick={onTools}><MoreHorizontal className="size-4" /></button>
    </nav>
  </div>
}

/** 跨日只是提醒，不改变原会话发送权或自动归档；跨午夜及切回页面时重新检查。 */
export function ConsultDayReminder({ session, disabled, onNew, onExtend }: {
  session: Pick<ConsultSessionView, 'sessionId' | 'createdAt'>; disabled: boolean
  onNew: () => void; onExtend: () => void
}) {
  const [now, setNow] = useState(Date.now)
  const [dismissed, setDismissed] = useState('')
  useEffect(() => {
    const update = () => setNow(Date.now())
    const interval = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', update) }
  }, [])
  const key = `${session.sessionId}:${consultationDate(now)}`
  if (!isPreviousConsultDay(session.createdAt, now) || dismissed === key) return null
  return <aside className="fc-desktop-notice" aria-label="跨天咨询提醒">
    <p>这条咨询开始于 {consultationDate(session.createdAt)}。建议按今天的问题新开会话，便于区分日期和结论。</p>
    <div><button type="button" disabled={disabled} onClick={onNew}>新开今天的咨询</button>
      <button type="button" disabled={disabled} onClick={onExtend}>带上旧内容新建</button>
      <button type="button" onClick={() => setDismissed(key)}>继续当前对话</button></div>
  </aside>
}
