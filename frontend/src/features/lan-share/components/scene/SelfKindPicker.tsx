import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { ALL_DEVICE_KINDS, deviceKindLabel } from '../../services/deviceProfile'
import { DeviceKindIcon } from './DeviceKindIcon'
import { cn } from '@/lib/utils'
import type { DeviceKind } from '../../types'

interface Props {
  open: boolean
  current: DeviceKind
  onClose: () => void
  onPick: (kind: DeviceKind) => void
}

export function SelfKindPicker({ open, current, onClose, onPick }: Props) {
  const isMobile = useIsMobile()

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="p-5">
        <SheetTitle>更换本机设备类型</SheetTitle>
        <SheetDescription className="mb-4">选择会以拟物图标展示给房间内其他设备</SheetDescription>

        <ul className="grid grid-cols-3 gap-3">
          {ALL_DEVICE_KINDS.map(kind => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => { onPick(kind); onClose() }}
                className={cn(
                  'w-full flex flex-col items-center gap-1 p-2 rounded-lg border',
                  'transition active:scale-95',
                  current === kind
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-border)] hover:bg-[var(--color-muted)]',
                )}
              >
                <DeviceKindIcon kind={kind} size={48} />
                <span className="text-xs">{deviceKindLabel(kind)}</span>
              </button>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

function useIsMobile(): boolean {
  const [isMobile, setMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(max-width: 767px)').matches
  })
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return isMobile
}
