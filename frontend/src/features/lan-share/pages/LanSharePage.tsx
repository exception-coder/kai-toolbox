import { useState } from 'react'
import { LobbyForm } from '../components/LobbyForm'
import { RoomView } from '../components/RoomView'
import { getOrCreateDeviceId, getNickname, setNickname, defaultNickname } from '../services/identity'

export function LanSharePage() {
  const [deviceId] = useState(() => getOrCreateDeviceId())
  const [nicknameState, setNicknameState] = useState(() => getNickname())
  const [roomId, setRoomId] = useState<string | null>(null)

  const handleJoin = (room: string, nickname: string) => {
    setNickname(nickname)
    setNicknameState(nickname)
    setRoomId(room)
  }

  if (!roomId) {
    return <LobbyForm defaultNickname={nicknameState || defaultNickname()} onJoin={handleJoin} />
  }

  return (
    <RoomView
      roomId={roomId}
      deviceId={deviceId}
      nickname={nicknameState}
      onLeave={() => setRoomId(null)}
    />
  )
}
