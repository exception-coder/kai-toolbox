import { useRef, useState, type RefObject } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { ArrowUpRight, Pin, X } from 'lucide-react'
import { useFullscreenPortalContainer } from '@/lib/fullscreen-portal'
import { CONSULT_UPGRADE_NOTES, type ConsultUpgradeNote } from '../data/upgradeNotes'

interface UpgradeNoticeProps {
  notices?: readonly ConsultUpgradeNote[]
  userId?: number
  open?: boolean
  onOpenChange?: (open: boolean) => void
  fallbackFocusRef?: RefObject<HTMLButtonElement | null>
}

function readDismissed(key: string): string {
  try { return localStorage.getItem(key) ?? '' } catch { return '' }
}

/** 纸签属于画布覆盖层，详情为无背景遮罩的非模态抽屉。 */
export function ConsultUpgradeNotice({ notices = CONSULT_UPGRADE_NOTES, userId, open: controlledOpen, onOpenChange, fallbackFocusRef }: UpgradeNoticeProps) {
  const [localOpen, setLocalOpen] = useState(false)
  const [dismissed, setDismissed] = useState<Record<string, string>>({})
  const returnFocus = useRef<HTMLElement | null>(null)
  const portalContainer = useFullscreenPortalContainer()
  const sortedNotes = [...notices].sort((a, b) => b.date.localeCompare(a.date))
  const latest = sortedNotes[0]
  const storageKey = `toolbox.consult.upgrade-dismissed.v1:${userId ?? 'guest'}`
  // 同日一批更新作为一个版本；更正原文不重新打扰，新增重要记录会重新提示。
  const version = sortedNotes.filter(note => note.date === latest?.date).map(note => note.id).join('|')
  const isDismissed = (dismissed[storageKey] ?? readDismissed(storageKey)) === version
  const open = controlledOpen ?? localOpen
  const setOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next) }
  const showDetails = () => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setOpen(true) }
  const dismiss = () => {
    setDismissed(values => ({ ...values, [storageKey]: version }))
    try { localStorage.setItem(storageKey, version) } catch { /* 存储不可用时仅在本次页面收起。 */ }
    fallbackFocusRef?.current?.focus()
  }
  if (!latest) return null
  return <>
    {!isDismissed && <aside aria-label="近期升级纸签" className="group pointer-events-auto absolute right-6 top-20 z-[25] hidden w-[232px] rounded-[10px] border border-[#e9e5db] bg-[#fffef9] text-stone-800 shadow-[0_2px_8px_rgba(56,48,32,0.04)] lg:block">
      <Pin className="pointer-events-none absolute -top-2 left-1/2 size-4 -translate-x-1/2 text-[#a68b67]" aria-hidden="true" />
      <button type="button" onClick={showDetails} aria-label="查看近期升级详情" className="block min-h-[108px] w-full rounded-[10px] px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500">
        <span className="block text-xs font-medium text-stone-500">近期升级</span>
        <span className="mt-2 block text-[13px] font-medium leading-5">{latest.title}</span>
        <span className="mt-2 flex items-center gap-1 text-xs text-stone-500">查看更新详情<ArrowUpRight className="size-3" aria-hidden="true" /></span>
      </button>
      <button type="button" aria-label="收起升级纸签" onClick={dismiss} className="absolute right-1 top-1 rounded-md p-1 text-stone-500 opacity-0 hover:bg-stone-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-stone-500 group-hover:opacity-100 group-focus-within:opacity-100"><X className="size-3" /></button>
    </aside>}
    <Dialog.Root modal={false} open={open} onOpenChange={setOpen}>
      <Dialog.Portal container={portalContainer}>
        <Dialog.Content aria-describedby="consult-upgrade-description"
          onOpenAutoFocus={() => {
            if (!returnFocus.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
            if (isDismissed) {
              setDismissed(values => ({ ...values, [storageKey]: '' }))
              try { localStorage.removeItem(storageKey) } catch { /* 页面内仍可恢复纸签。 */ }
            }
          }}
          onCloseAutoFocus={event => { event.preventDefault(); const target = returnFocus.current; (target?.isConnected ? target : fallbackFocusRef?.current)?.focus(); returnFocus.current = null }}
          onInteractOutside={event => event.preventDefault()}
          className="fixed bottom-4 right-4 top-4 z-50 flex w-[calc(100%-32px)] max-w-[352px] flex-col rounded-xl border border-[#e9e5db] bg-[#fffef9] text-stone-800 shadow-[0_4px_20px_rgba(56,48,32,0.08)] focus:outline-none lg:bottom-6 lg:right-6 lg:top-20">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#e9e5db] px-5 py-4">
            <div><Dialog.Title className="text-sm font-medium">近期升级</Dialog.Title><Dialog.Description id="consult-upgrade-description" className="mt-1 text-xs text-stone-500">重要变化与使用方法</Dialog.Description></div>
            <Dialog.Close aria-label="关闭升级详情" className="rounded-md p-1 text-stone-500 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-500"><X className="size-4" /></Dialog.Close>
          </div>
          <ol tabIndex={0} aria-label="完整升级记录" className="min-h-0 flex-1 overflow-y-auto px-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-stone-400">
            {sortedNotes.map(note => <li key={note.id} className="border-b border-[#e9e5db] py-4 last:border-0">
              <time dateTime={note.date} className="text-[11px] tabular-nums text-stone-500">{note.date}</time>
              <h3 className="mt-2 text-[13px] font-medium">{note.title}</h3>
              <p className="mt-1 text-xs leading-5 text-stone-600">{note.summary}</p>
            </li>)}
          </ol>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  </>
}
