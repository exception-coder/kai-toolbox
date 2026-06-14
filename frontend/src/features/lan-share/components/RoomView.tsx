import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { isMockEnabled } from '@/lib/mock/mode'
import { useRoom } from '../hooks/useRoom'
import { useDeviceProfileExchange } from '../hooks/useDeviceProfileExchange'
import { RoomScene } from './scene/RoomScene'
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

  const { selfProfile, setSelfKind } = useDeviceProfileExchange({
    enabled: !isMockEnabled(),
    peers: room.peers,
    readyPeerIds: room.readyPeerIds,
    sendControlTo: room.sendControlTo,
  })

  const handleLeave = () => {
    room.leave()
    onLeave()
  }

  const incomingProfile = room.incoming
    ? room.deviceProfiles.get(room.incoming.peer.deviceId)
    : undefined

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">房间 {roomId}</h2>
        <Badge variant={room.status === 'joined' ? 'default' : 'secondary'}>
          {room.status === 'connecting' ? '连接中' :
           room.status === 'joined' ? '已加入' :
           room.status === 'error' ? '出错' : '空闲'}
        </Badge>
        <Badge variant="outline" className="hidden sm:inline-flex">
          共 {room.peers.length + 1} 台设备
        </Badge>
        {room.errorMessage && <span className="text-sm text-destructive truncate">{room.errorMessage}</span>}
        <Button variant="outline" size="sm" className="ml-auto" onClick={handleLeave}>
          <LogOut className="mr-1 h-4 w-4" />
          离开房间
        </Button>
      </div>

      <RoomScene
        selfDeviceId={room.selfDeviceId}
        selfNickname={nickname}
        selfProfile={selfProfile}
        peers={room.peers}
        deviceProfiles={room.deviceProfiles}
        readyPeerIds={room.readyPeerIds}
        connectionTypes={room.connectionTypes}
        transfers={room.transfers}
        onSendFileTo={room.sendFileTo}
        onBroadcastFile={room.broadcastFile}
        onChangeSelfKind={setSelfKind}
      />

      <TransferList transfers={room.transfers} deviceProfiles={room.deviceProfiles} />

      {room.incoming && (
        <IncomingDialog
          peer={room.incoming.peer}
          peerProfile={incomingProfile}
          offer={room.incoming.offer}
          onAccept={room.acceptIncoming}
          onReject={room.rejectIncoming}
        />
      )}
    </div>
  )
}
