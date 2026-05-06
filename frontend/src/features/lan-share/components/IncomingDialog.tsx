import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DeviceKindIcon } from './scene/DeviceKindIcon'
import { deviceKindLabel } from '../services/deviceProfile'
import type { Peer, FileOffer, DeviceProfile } from '../types'

interface IncomingDialogProps {
  peer: Peer
  peerProfile?: DeviceProfile
  offer: FileOffer
  onAccept: () => void
  onReject: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

export function IncomingDialog({ peer, peerProfile, offer, onAccept, onReject }: IncomingDialogProps) {
  const kind = peerProfile?.kind ?? 'unknown'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <DeviceKindIcon kind={kind} size={48} />
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold truncate">{peer.nickname} 想给你发文件</h3>
              <p className="text-xs text-muted-foreground">{deviceKindLabel(kind)}</p>
            </div>
          </div>
          <div className="space-y-2 text-sm mb-5">
            <div><span className="text-muted-foreground">文件名:</span> <span className="font-medium break-all">{offer.name}</span></div>
            <div><span className="text-muted-foreground">大小:</span> {formatSize(offer.size)}</div>
            {offer.mime && <div><span className="text-muted-foreground">类型:</span> {offer.mime}</div>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onReject}>
              <X className="mr-1 h-4 w-4" />
              拒绝
            </Button>
            <Button onClick={onAccept}>
              <Download className="mr-1 h-4 w-4" />
              接收并下载
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
