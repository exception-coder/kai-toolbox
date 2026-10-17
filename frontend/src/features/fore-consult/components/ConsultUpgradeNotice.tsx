import { Pin } from 'lucide-react'
import { CONSULT_UPGRADE_NOTES, type ConsultUpgradeNote } from '../data/upgradeNotes'

/** 固定在图谱右上角，直接展示最近五项重大更新。 */
export function ConsultUpgradeNotice({ notices = CONSULT_UPGRADE_NOTES }: { notices?: readonly ConsultUpgradeNote[] }) {
  const latestNotes = [...notices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
  if (latestNotes.length === 0) return null
  return <aside aria-label="近期重大升级" className="pointer-events-auto absolute right-4 top-48 z-[25] flex max-h-[35%] w-[min(288px,calc(100%-32px))] flex-col rounded-lg border border-amber-200/70 bg-[#fffdf4] text-stone-800 shadow-sm lg:right-6 lg:top-20 lg:max-h-[55%]">
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-amber-200/60 px-4 py-3">
      <h2 className="flex items-center gap-2 text-sm font-medium"><Pin className="size-3.5 text-amber-700" aria-hidden="true" />近期升级</h2>
      <span className="text-[11px] text-stone-500">最新 5 条</span>
    </div>
    <ol tabIndex={0} aria-label="最近五条升级内容" className="min-h-0 overflow-y-auto px-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-amber-600">
      {latestNotes.map(note => <li key={note.id} className="border-b border-amber-200/50 py-2 last:border-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-xs font-medium leading-5">{note.title}</h3>
          <time dateTime={note.date} className="shrink-0 text-[10px] tabular-nums text-stone-500">{note.date.slice(5).replace('-', '.')}</time>
        </div>
        <p className="mt-1 text-[11px] leading-4 text-stone-600">{note.summary}</p>
      </li>)}
    </ol>
  </aside>
}
