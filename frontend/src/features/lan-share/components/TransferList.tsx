import { ArrowDown, ArrowUp, Check, X, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import type { Transfer } from '../types'

interface TransferListProps {
  transfers: Transfer[]
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function StateBadge({ state }: { state: Transfer['state'] }) {
  switch (state) {
    case 'pending':      return <Badge variant="secondary">等待</Badge>
    case 'transferring': return <Badge>传输中</Badge>
    case 'completed':    return <Badge variant="outline" className="text-green-600 border-green-300"><Check className="h-3 w-3 mr-1" />完成</Badge>
    case 'rejected':     return <Badge variant="outline" className="text-orange-600 border-orange-300"><X className="h-3 w-3 mr-1" />拒绝</Badge>
    case 'failed':       return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />失败</Badge>
  }
}

export function TransferList({ transfers }: TransferListProps) {
  if (transfers.length === 0) {
    return null
  }
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="font-medium mb-3">传输列表</h3>
        <ul className="space-y-3">
          {transfers.map(t => {
            const pct = t.size > 0 ? Math.round((t.bytesTransferred / t.size) * 100) : 0
            return (
              <li key={`${t.id}-${t.direction}-${t.peerDeviceId}`} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  {t.direction === 'send' ? <ArrowUp className="h-4 w-4 text-blue-500" /> : <ArrowDown className="h-4 w-4 text-green-500" />}
                  <span className="font-medium truncate flex-1">{t.fileName || '(待协商)'}</span>
                  <StateBadge state={t.state} />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{t.direction === 'send' ? '→' : '←'} {t.peerNickname}</span>
                  <span className="ml-auto">{formatSize(t.bytesTransferred)} / {formatSize(t.size)}</span>
                </div>
                {(t.state === 'transferring' || t.state === 'pending') && <Progress value={pct} />}
                {t.errorMessage && <p className="text-xs text-destructive">{t.errorMessage}</p>}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
