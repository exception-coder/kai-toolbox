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

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10">
      {!roomId ? (
        <LobbyForm defaultNickname={nicknameState || defaultNickname()} onJoin={handleJoin} />
      ) : (
        <RoomView
          roomId={roomId}
          deviceId={deviceId}
          nickname={nicknameState}
          onLeave={() => setRoomId(null)}
        />
      )}
    </div>
  )
}
