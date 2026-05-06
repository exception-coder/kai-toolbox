export type Peer = {
  deviceId: string
  nickname: string
  joinedAt: number
}

export type FileOffer = {
  fileId: string
  name: string
  size: number
  mime?: string
  totalChunks: number
}

export type TransferState =
  | 'pending'        // 发起方等接收方 accept
  | 'transferring'
  | 'completed'
  | 'rejected'
  | 'failed'

export type Transfer = {
  id: string                       // fileId
  direction: 'send' | 'receive'
  peerDeviceId: string
  peerNickname: string
  fileName: string
  size: number
  state: TransferState
  bytesTransferred: number
  errorMessage?: string
}

// 设备画像：用于在房间内可视化每位 peer 是什么设备
export type DeviceKind =
  | 'iphone'
  | 'ipad'
  | 'android-phone'
  | 'android-tablet'
  | 'windows'
  | 'mac'
  | 'linux'
  | 'unknown'

export interface DeviceProfile {
  kind: DeviceKind
  modelHint?: string     // 预留：未来扩展机型
  colorHint?: string     // 预留：未来扩展配色
}

// WebSocket 信令消息
export type SignalingInbound =
  | { type: 'joined'; self: string; peers: Peer[] }
  | { type: 'peer-joined'; peer: Peer }
  | { type: 'peer-left'; deviceId: string }
  | { type: 'signal'; from: string; payload: unknown }
  | { type: 'error'; code: string; message: string }

export type SignalingOutbound =
  | { type: 'join'; roomId: string; deviceId: string; nickname: string }
  | { type: 'leave' }
  | { type: 'signal'; to: string; payload: unknown }

// DataChannel control 消息
export type ControlMessage =
  | { type: 'offer'; fileId: string; name: string; size: number; mime?: string; totalChunks: number }
  | { type: 'accept'; fileId: string }
  | { type: 'reject'; fileId: string; reason?: string }
  | { type: 'progress'; fileId: string; received: number }
  | { type: 'complete'; fileId: string }
  | { type: 'cancel'; fileId: string }
  | { type: 'device-profile'; profile: DeviceProfile }
