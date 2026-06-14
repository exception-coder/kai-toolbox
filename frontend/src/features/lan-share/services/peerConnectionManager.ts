import type { Peer, FileOffer, ControlMessage, DeviceProfile, ConnectionLinkType } from '../types'
import type { SignalingClient } from './signalingClient'
import { sendFile, createReceiver, triggerBrowserDownload } from './fileTransfer'

const BUILD_TIMEOUT_MS = 10_000

interface PeerConnectionEntry {
  pc: RTCPeerConnection
  controlDC?: RTCDataChannel
  dataDC?: RTCDataChannel
  receiverClose?: () => void
  ready: Promise<void>
  resolveReady: () => void
  rejectReady: (e: Error) => void
  notifiedReady: boolean
  topControlListener?: (ev: MessageEvent) => void
}

export interface PeerConnectionManager {
  connectTo(peerDeviceId: string): Promise<void>
  sendFile(peerDeviceId: string, file: File): Promise<void>
  broadcastFile(peers: Peer[], file: File): Promise<void>
  sendControl(peerDeviceId: string, msg: ControlMessage): boolean
  broadcastControl(peers: Peer[], msg: ControlMessage): void
  closeAll(): void
}

export interface PeerConnectionManagerCallbacks {
  onIncomingFile: (peer: Peer, offer: FileOffer) => Promise<boolean>
  onTransferProgress: (
    fileId: string,
    direction: 'send' | 'receive',
    peerDeviceId: string,
    bytes: number,
    total: number,
  ) => void
  onTransferComplete: (
    fileId: string,
    direction: 'send' | 'receive',
    peerDeviceId: string,
    blob?: Blob,
    fileName?: string,
  ) => void
  onTransferRejected: (fileId: string, peerDeviceId: string, reason?: string) => void
  onTransferFailed: (fileId: string, peerDeviceId: string, message: string) => void
  onConnectionFailed: (peerDeviceId: string, message: string) => void
  onPeerReady?: (peerDeviceId: string) => void
  onDeviceProfile?: (peerDeviceId: string, profile: DeviceProfile) => void
  onConnectionType?: (peerDeviceId: string, type: ConnectionLinkType) => void
}

// 从 RTCPeerConnection 统计里读出选中 candidate pair 的本地 candidate 类型，
// 映射成业务关心的链路类型。确定性优先：完全由浏览器统计推导，不做猜测。
async function probeLinkType(pc: RTCPeerConnection): Promise<ConnectionLinkType> {
  try {
    const stats = await pc.getStats()
    let pair: RTCStats & Record<string, unknown> | undefined
    stats.forEach((report) => {
      const r = report as RTCStats & Record<string, unknown>
      if (r.type === 'candidate-pair' && (r.state === 'succeeded') &&
          (r.nominated === true || r.selected === true)) {
        pair = r
      }
    })
    // 部分浏览器不标 nominated，退而求其次取 state=succeeded 的第一条
    if (!pair) {
      stats.forEach((report) => {
        const r = report as RTCStats & Record<string, unknown>
        if (!pair && r.type === 'candidate-pair' && r.state === 'succeeded') pair = r
      })
    }
    if (!pair) return 'unknown'
    const localId = pair.localCandidateId as string | undefined
    if (!localId) return 'unknown'
    const local = stats.get(localId) as (RTCStats & Record<string, unknown>) | undefined
    const candidateType = local?.candidateType as string | undefined
    switch (candidateType) {
      case 'host': return 'lan'
      case 'srflx':
      case 'prflx': return 'stun'
      case 'relay': return 'relay'
      default: return 'unknown'
    }
  } catch {
    return 'unknown'
  }
}

export function createPeerConnectionManager(
  signaling: SignalingClient,
  iceServers: RTCIceServer[],
  selfDeviceId: string,
  getPeer: (deviceId: string) => Peer | undefined,
  callbacks: PeerConnectionManagerCallbacks,
): PeerConnectionManager {
  const peers = new Map<string, PeerConnectionEntry>()

  function ensureEntry(peerDeviceId: string): PeerConnectionEntry {
    let entry = peers.get(peerDeviceId)
    if (entry) return entry

    const pc = new RTCPeerConnection({ iceServers })
    let resolveReady!: () => void
    let rejectReady!: (e: Error) => void
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    entry = { pc, ready, resolveReady, rejectReady, notifiedReady: false }
    peers.set(peerDeviceId, entry)

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        signaling.send({
          type: 'signal',
          to: peerDeviceId,
          payload: { kind: 'ice', candidate: ev.candidate.toJSON() },
        })
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        void probeLinkType(pc).then(type => callbacks.onConnectionType?.(peerDeviceId, type))
      }
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        callbacks.onConnectionFailed(peerDeviceId, `connectionState=${pc.connectionState}`)
      }
    }

    pc.ondatachannel = (ev) => {
      if (ev.channel.label === 'control') entry!.controlDC = ev.channel
      if (ev.channel.label === 'data') {
        ev.channel.binaryType = 'arraybuffer'
        entry!.dataDC = ev.channel
      }
      maybeAttachReceiver(peerDeviceId, entry!)
    }

    return entry
  }

  function maybeAttachReceiver(peerDeviceId: string, entry: PeerConnectionEntry) {
    if (entry.controlDC && entry.dataDC && !entry.receiverClose) {
      const peer = getPeer(peerDeviceId)
      const receiver = createReceiver(entry.controlDC, entry.dataDC, {
        onIncoming: async (offer) => {
          if (!peer) return false
          return callbacks.onIncomingFile(peer, offer)
        },
        onProgress: (fileId, received, total) => {
          callbacks.onTransferProgress(fileId, 'receive', peerDeviceId, received, total)
        },
        onComplete: (fileId, blob, offer) => {
          triggerBrowserDownload(blob, offer.name)
          callbacks.onTransferComplete(fileId, 'receive', peerDeviceId, blob, offer.name)
        },
      })
      entry.receiverClose = receiver.close

      // 顶层 control listener：fileTransfer 内的 listener 仅识别 file 相关消息，
      // 这里专门处理 device-profile 等扩展控制消息，互不冲突。
      const topControl = (ev: MessageEvent) => {
        let msg: ControlMessage
        try { msg = JSON.parse(ev.data) } catch { return }
        if (msg.type === 'device-profile') {
          callbacks.onDeviceProfile?.(peerDeviceId, msg.profile)
        }
      }
      entry.controlDC.addEventListener('message', topControl)
      entry.topControlListener = topControl

      const onOpen = () => {
        if (entry.controlDC?.readyState === 'open' && entry.dataDC?.readyState === 'open') {
          entry.resolveReady()
          if (!entry.notifiedReady) {
            entry.notifiedReady = true
            callbacks.onPeerReady?.(peerDeviceId)
          }
        }
      }
      entry.controlDC.addEventListener('open', onOpen)
      entry.dataDC.addEventListener('open', onOpen)
      onOpen()
    }
  }

  // 处理来自对端的 SDP / ICE
  signaling.on('signal', async (msg) => {
    const fromDeviceId = msg.from
    const payload = msg.payload as { kind: string; sdp?: string; type?: string; candidate?: RTCIceCandidateInit }
    const entry = ensureEntry(fromDeviceId)
    const pc = entry.pc

    if (payload.kind === 'offer') {
      // 我们是被动方
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === 'control') entry.controlDC = ev.channel
        if (ev.channel.label === 'data') {
          ev.channel.binaryType = 'arraybuffer'
          entry.dataDC = ev.channel
        }
        maybeAttachReceiver(fromDeviceId, entry)
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp! })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      signaling.send({
        type: 'signal',
        to: fromDeviceId,
        payload: { kind: 'answer', sdp: answer.sdp },
      })
    } else if (payload.kind === 'answer') {
      await pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp! })
    } else if (payload.kind === 'ice' && payload.candidate) {
      try { await pc.addIceCandidate(payload.candidate) } catch { /* 忽略已结束 PC */ }
    }
  })

  async function connectTo(peerDeviceId: string): Promise<void> {
    let entry = peers.get(peerDeviceId)
    if (entry && entry.controlDC?.readyState === 'open') return // 复用

    entry = ensureEntry(peerDeviceId)
    const pc = entry.pc

    const control = pc.createDataChannel('control', { ordered: true })
    const data = pc.createDataChannel('data', { ordered: true })
    data.binaryType = 'arraybuffer'
    entry.controlDC = control
    entry.dataDC = data
    maybeAttachReceiver(peerDeviceId, entry)

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    signaling.send({
      type: 'signal',
      to: peerDeviceId,
      payload: { kind: 'offer', sdp: offer.sdp },
    })

    await Promise.race([
      entry.ready,
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('build-timeout')), BUILD_TIMEOUT_MS)
      ),
    ])
  }

  async function sendFileTo(peerDeviceId: string, file: File): Promise<void> {
    await connectTo(peerDeviceId)
    const entry = peers.get(peerDeviceId)!
    await sendFile(entry.controlDC!, entry.dataDC!, file, {
      onAccepted: (fileId) => callbacks.onTransferProgress(fileId, 'send', peerDeviceId, 0, file.size),
      onProgress: (fileId, sent) => callbacks.onTransferProgress(fileId, 'send', peerDeviceId, sent, file.size),
      onComplete: (fileId) => callbacks.onTransferComplete(fileId, 'send', peerDeviceId),
      onRejected: (fileId, reason) => callbacks.onTransferRejected(fileId, peerDeviceId, reason),
      onFailed: (fileId, err) => callbacks.onTransferFailed(fileId, peerDeviceId, err.message),
    })
  }

  async function broadcastFile(targets: Peer[], file: File): Promise<void> {
    await Promise.allSettled(
      targets
        .filter(p => p.deviceId !== selfDeviceId)
        .map(p => sendFileTo(p.deviceId, file))
    )
  }

  function sendControl(peerDeviceId: string, msg: ControlMessage): boolean {
    const entry = peers.get(peerDeviceId)
    if (!entry || entry.controlDC?.readyState !== 'open') return false
    try {
      entry.controlDC.send(JSON.stringify(msg))
      return true
    } catch (e) {
      console.warn('[lan-share] sendControl failed', peerDeviceId, e)
      return false
    }
  }

  function broadcastControl(targets: Peer[], msg: ControlMessage): void {
    for (const p of targets) {
      if (p.deviceId === selfDeviceId) continue
      sendControl(p.deviceId, msg)
    }
  }

  function closeAll(): void {
    for (const entry of peers.values()) {
      entry.receiverClose?.()
      if (entry.topControlListener && entry.controlDC) {
        entry.controlDC.removeEventListener('message', entry.topControlListener)
      }
      try { entry.pc.close() } catch { /* ignore */ }
    }
    peers.clear()
  }

  return { connectTo, sendFile: sendFileTo, broadcastFile, sendControl, broadcastControl, closeAll }
}
