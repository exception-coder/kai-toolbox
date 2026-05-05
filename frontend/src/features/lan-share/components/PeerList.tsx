import { Monitor } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { Peer } from '../types'

interface PeerListProps {
  selfDeviceId: string
  selfNickname: string
  peers: Peer[]
}

export function PeerList({ selfDeviceId, selfNickname, peers }: PeerListProps) {
  const total = peers.length + 1
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium">房间成员</h3>
          <Badge variant="secondary">{total} 人</Badge>
        </div>
        <ul className="space-y-2">
          <li className="flex items-center gap-2 text-sm">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{selfNickname}</span>
            <Badge variant="outline" className="ml-auto">本机</Badge>
          </li>
          {peers.map(p => (
            <li key={p.deviceId} className="flex items-center gap-2 text-sm">
              <Monitor className="h-4 w-4 text-muted-foreground" />
              <span>{p.nickname}</span>
              <span className="text-xs text-muted-foreground ml-auto">
                {p.deviceId.slice(0, 8)}
              </span>
            </li>
          ))}
          {peers.length === 0 && (
            <li className="text-sm text-muted-foreground italic py-2">
              等其他设备加入相同房间号...
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  )
}
