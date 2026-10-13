import type { CommunicationInput } from '../../api/communicationJournal'

export const journalInputClass = 'min-h-11 w-full rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]'
export function CommunicationFields({ input, disabled, onChange }: {
  input: CommunicationInput; disabled: boolean; onChange: (patch: Partial<CommunicationInput>) => void
}) {
  return <label className="block space-y-2 text-xs">内容<textarea autoFocus rows={6} maxLength={20000} className={journalInputClass + ' resize-y leading-relaxed'} value={input.originalText} onChange={event => onChange({ originalText: event.target.value })} disabled={disabled} placeholder="记下要做的事，也可以直接粘贴图片…" /></label>
}
