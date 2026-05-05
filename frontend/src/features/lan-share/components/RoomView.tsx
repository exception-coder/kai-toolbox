import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRoom } from '../hooks/useRoom'
import { PeerList } from './PeerList'
import { FileSender } from './FileSender'
import { IncomingDialog } from './IncomingDialog'
import { TransferList } from './TransferList'

interface RoomViewProps {
  roomId: string
  deviceId: string
  nickname: string
  onLeave: () => void
}

export function RoomView({ roomId, deviceId, nickname, onLeave }: RoomViewProps) {
  const room = useRoom(roomId, deviceId, nickname)

  const handleLeave = () => {
    room.leave()
    onLeave()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">房间 {roomId}</h2>
        <Badge variant={room.status === 'joined' ? 'default' : 'secondary'}>
          {room.status === 'connecting' ? '连接中' :
           room.status === 'joined' ? '已加入' :
           room.status === 'error' ? '出错' : '空闲'}
        </Badge>
        {room.errorMessage && <span className="text-sm text-destructive">{room.errorMessage}</span>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={handleLeave}>
          <LogOut className="mr-1 h-4 w-4" />
          离开房间
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <PeerList selfDeviceId={room.selfDeviceId} selfNickname={nickname} peers={room.peers} />
        <FileSender peers={room.peers} onSend={room.sendFileTo} onBroadcast={room.broadcastFile} />
      </div>

      <TransferList transfers={room.transfers} />

      {room.incoming && (
        <IncomingDialog
          peer={room.incoming.peer}
          offer={room.incoming.offer}
          onAccept={room.acceptIncoming}
          onReject={room.rejectIncoming}
        />
      )}
    </div>
  )
}
