import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { CONSULT_UPGRADE_NOTES, formatUpgradeNote, type ConsultUpgradeNote } from '../data/upgradeNotes'

/** 更新由用户主动查看；每张纸条独立复制，不打断咨询。 */
export function ConsultUpgradeNotice({ notices = CONSULT_UPGRADE_NOTES }: { notices?: readonly ConsultUpgradeNote[] }) {
  const [copyStates, setCopyStates] = useState<Record<string, 'copied' | 'failed'>>({})
  const sortedNotes = [...notices].sort((a, b) => b.date.localeCompare(a.date))
  const copy = async (note: ConsultUpgradeNote) => {
    try {
      await navigator.clipboard.writeText(formatUpgradeNote(note))
      setCopyStates(states => ({ ...states, [note.id]: 'copied' }))
    } catch { setCopyStates(states => ({ ...states, [note.id]: 'failed' })) }
  }
  return <Sheet onOpenChange={() => setCopyStates({})}>
    <SheetTrigger asChild>
      <button type="button" aria-label="查看更新小纸条"
        className="pointer-events-auto inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
        <span className="size-1.5 rounded-full bg-emerald-600" aria-hidden="true" />更新小纸条 · {notices.length}
      </button>
    </SheetTrigger>
    <SheetContent hideCloseButton className="flex h-full w-full max-w-[520px] flex-col bg-background text-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-5">
        <div>
          <SheetTitle>更新小纸条</SheetTitle>
          <SheetDescription className="mt-2 leading-6">重磅更新都记在这里，新变化在前，历史随时可查。</SheetDescription>
        </div>
        <SheetClose asChild>
          <button type="button" aria-label="关闭更新小纸条" className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></button>
        </SheetClose>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5">
        {sortedNotes.length === 0 && <p className="py-5 text-sm text-muted-foreground">暂时没有更新记录，后续重磅更新会登记在这里。</p>}
        {sortedNotes.map(note => <article key={note.id} aria-label={note.title} className="border-b border-border py-5 last:border-b-0">
          <p className="text-xs tabular-nums text-muted-foreground"><time dateTime={note.date}>{note.date}</time></p>
          <h3 className="mt-2 text-base font-semibold">{note.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{note.summary}</p>
          <ol className="mt-4 divide-y divide-border">
            {note.changes.map((change, index) => <li key={change.title} className="flex gap-4 py-4 first:pt-0">
              <span className="pt-0.5 text-xs tabular-nums text-muted-foreground" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
              <div className="min-w-0">
                <h4 className="text-sm font-medium">{change.title}</h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{change.detail}</p>
              </div>
            </li>)}
          </ol>
          <p className="border-t border-border py-4 text-xs leading-5 text-muted-foreground">{note.scope}</p>
          {copyStates[note.id] === 'failed' && <p role="alert" className="mb-2 text-xs text-red-600">复制失败，可重试或选中正文手动复制。</p>}
          <button type="button" onClick={() => void copy(note)} aria-label={`复制小纸条：${note.title}`}
            className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
            {copyStates[note.id] === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
            <span role="status">{copyStates[note.id] === 'copied' ? '已复制，可转发给同事' : '复制这张纸条'}</span>
          </button>
        </article>)}
      </div>
    </SheetContent>
  </Sheet>
}
