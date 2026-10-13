import type { CommunicationInput } from '../../api/communicationJournal'

export const journalInputClass = 'min-h-11 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
function localTime(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  const date = new Date(value)
  return new Date(value - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
export function CommunicationFields({ input, disabled, onChange }: {
  input: CommunicationInput; disabled: boolean; onChange: (patch: Partial<CommunicationInput>) => void
}) {
  return <>
    <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
      <label className="space-y-1 text-xs">主题<input required maxLength={160} className={journalInputClass} value={input.title} onChange={event => onChange({ title: event.target.value })} disabled={disabled} placeholder="例如：生产单保存流程沟通" /></label>
      <label className="space-y-1 text-xs">沟通时间<input required type="datetime-local" className={journalInputClass} value={localTime(input.occurredAt)} onChange={event => onChange({ occurredAt: new Date(event.target.value).getTime() })} disabled={disabled} /></label>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="space-y-1 text-xs">来源<input maxLength={100} className={journalInputClass} value={input.source} onChange={event => onChange({ source: event.target.value })} disabled={disabled} placeholder="飞书 / 微信 / 电话 / 会议" /></label>
      <label className="space-y-1 text-xs">参与人<input maxLength={300} className={journalInputClass} value={input.participants} onChange={event => onChange({ participants: event.target.value })} disabled={disabled} placeholder="参与本次沟通的人" /></label>
    </div>
    <label className="block space-y-1 text-xs">来源链接 · 可选<input type="url" maxLength={2000} className={journalInputClass} value={input.sourceUrl} onChange={event => onChange({ sourceUrl: event.target.value })} disabled={disabled} placeholder="https://…" /></label>
    <label className="block space-y-1 text-xs">沟通原文<textarea rows={5} maxLength={20000} className={journalInputClass + ' resize-y leading-relaxed'} value={input.originalText} onChange={event => onChange({ originalText: event.target.value })} disabled={disabled} placeholder="粘贴沟通内容，保留对方原意；也可只附截图。" /></label>
  </>
}
