import { useEffect, useState } from 'react'
import { FileUp, X } from 'lucide-react'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { DeviceKindIcon } from './DeviceKindIcon'
import { deviceKindLabel } from '../../services/deviceProfile'
import type { DeviceProfile, Peer } from '../../types'

interface Props {
  open: boolean
  target: Peer | null
  targetProfile: DeviceProfile | undefined
  isPeerReady: boolean
  onClose: () => void
  onPickFile: () => void
}

export function TargetActionPanel({ open, target, targetProfile, isPeerReady, onClose, onPickFile }: Props) {
  const isMobile = useIsMobile()
  if (!target) return null

  const kind = targetProfile?.kind ?? 'unknown'

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose() }}>
      <SheetContent side={isMobile ? 'bottom' : 'right'} className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <DeviceKindIcon kind={kind} size={48} />
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{target.nickname}</SheetTitle>
            <SheetDescription className="truncate">{deviceKindLabel(kind)}</SheetDescription>
          </div>
        </div>

        {!isPeerReady && (
          <p className="text-xs text-[var(--color-muted-foreground)]">
            正在与对方建立连接，第一次发送会等待几秒...
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button onClick={onPickFile} className="h-12">
            <FileUp className="mr-2 h-4 w-4" />
            选择文件并发送
          </Button>
          <Button variant="outline" onClick={onClose} className="h-10">
            <X className="mr-2 h-4 w-4" />
            取消
          </Button>
        </div>
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
