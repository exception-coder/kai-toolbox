import { Download, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Peer, FileOffer } from '../types'

interface IncomingDialogProps {
  peer: Peer
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

export function IncomingDialog({ peer, offer, onAccept, onReject }: IncomingDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="p-5">
          <h3 className="text-lg font-semibold mb-3">收到文件传输请求</h3>
          <div className="space-y-2 text-sm mb-5">
            <div><span className="text-muted-foreground">来自：</span><span className="font-medium">{peer.nickname}</span></div>
            <div><span className="text-muted-foreground">文件名：</span><span className="font-medium break-all">{offer.name}</span></div>
            <div><span className="text-muted-foreground">大小：</span>{formatSize(offer.size)}</div>
            {offer.mime && <div><span className="text-muted-foreground">类型：</span>{offer.mime}</div>}
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
