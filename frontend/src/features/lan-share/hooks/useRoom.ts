import { useCallback, useEffect, useRef, useState } from 'react'
import type { Peer, Transfer, FileOffer, SignalingInbound, ControlMessage, DeviceProfile } from '../types'
import { http } from '@/lib/api'
import { isMockEnabled } from '@/lib/mock/mode'
import { createSignalingClient, type SignalingClient } from '../services/signalingClient'
import { createPeerConnectionManager, type PeerConnectionManager } from '../services/peerConnectionManager'
import { createMockOrchestrator } from '../services/mockOrchestrator'

type Status = 'idle' | 'connecting' | 'joined' | 'error'
type IncomingPrompt = {
  peer: Peer
  offer: FileOffer
  resolve: (accept: boolean) => void
}

interface UseRoomResult {
  status: Status
  errorMessage: string | null
  selfDeviceId: string
  peers: Peer[]
  transfers: Transfer[]
  incoming: IncomingPrompt | null
  deviceProfiles: Map<string, DeviceProfile>
  readyPeerIds: Set<string>
  acceptIncoming: () => void
  rejectIncoming: () => void
  sendFileTo: (peerDeviceId: string, file: File) => void
  broadcastFile: (file: File) => void
  sendControlTo: (peerDeviceId: string, msg: ControlMessage) => boolean
  setMockDeviceProfile: (deviceId: string, profile: DeviceProfile) => void
  leave: () => void
}

export function useRoom(roomId: string, deviceId: string, nickname: string): UseRoomResult {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [peers, setPeers] = useState<Peer[]>([])
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [incoming, setIncoming] = useState<IncomingPrompt | null>(null)
  const [deviceProfiles, setDeviceProfiles] = useState<Map<string, DeviceProfile>>(() => new Map())
  const [readyPeerIds, setReadyPeerIds] = useState<Set<string>>(() => new Set())

  const signalingRef = useRef<SignalingClient | null>(null)
  const managerRef = useRef<PeerConnectionManager | null>(null)
  const mockRef = useRef<ReturnType<typeof createMockOrchestrator> | null>(null)
  const mockEnabledRef = useRef<boolean>(isMockEnabled())
  const peersRef = useRef<Peer[]>([])

  // 始终保持 ref 与 state 同步，给 PCM 用
  useEffect(() => { peersRef.current = peers }, [peers])

  const upsertTransfer = useCallback((t: Transfer) => {
    setTransfers(prev => {
      const idx = prev.findIndex(x => x.id === t.id && x.peerDeviceId === t.peerDeviceId && x.direction === t.direction)
      if (idx >= 0) {
        const clone = prev.slice()
        clone[idx] = { ...prev[idx], ...t }
        return clone
      }
      return [...prev, t]
    })
  }, [])

  useEffect(() => {
    let cancelled = false
    setStatus('connecting')
    setErrorMessage(null)

    // Mock 模式：跳过 WS + WebRTC，由内存编排器直接驱动状态
    if (mockEnabledRef.current) {
      const orchestrator = createMockOrchestrator({
        setStatus,
        setPeers,
        setIncoming,
        upsertTransfer,
        setMockDeviceProfile: (deviceId, profile) => {
          setDeviceProfiles(prev => {
            const next = new Map(prev)
            next.set(deviceId, profile)
            return next
          })
        },
      })
      mockRef.current = orchestrator
      return () => {
        orchestrator.cleanup()
        mockRef.current = null
      }
    }

    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${wsProtocol}://${location.host}/api/lan-share/signaling`

    const signaling = createSignalingClient(wsUrl)
    signalingRef.current = signaling

    let unsubscribers: Array<() => void> = []

    void (async () => {
      let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }]
      try {
        const cfg = await http<{ iceServers: { urls: string }[] }>('/lan-share/ice-config')
        iceServers = cfg.iceServers.map(s => ({ urls: s.urls }))
      } catch {
        // 兜底走默认 STUN
      }
      if (cancelled) return

      const manager = createPeerConnectionManager(
        signaling,
        iceServers,
        deviceId,
        (id) => peersRef.current.find(p => p.deviceId === id),
        {
          onIncomingFile: async (peer, offer) => {
            return new Promise<boolean>((resolve) => {
              setIncoming({ peer, offer, resolve })
            })
          },
          onTransferProgress: (fileId, direction, peerDeviceId, bytes, total) => {
            const peer = peersRef.current.find(p => p.deviceId === peerDeviceId)
            upsertTransfer({
              id: fileId, direction, peerDeviceId,
              peerNickname: peer?.nickname ?? peerDeviceId,
              fileName: '', size: total, state: 'transferring', bytesTransferred: bytes,
            })
          },
          onTransferComplete: (fileId, direction, peerDeviceId, _blob, fileName) => {
            setTransfers(prev => prev.map(t =>
              t.id === fileId && t.peerDeviceId === peerDeviceId && t.direction === direction
                ? { ...t, state: 'completed', bytesTransferred: t.size, fileName: fileName ?? t.fileName }
                : t
            ))
          },
          onTransferRejected: (fileId, peerDeviceId) => {
            setTransfers(prev => prev.map(t =>
              t.id === fileId && t.peerDeviceId === peerDeviceId
                ? { ...t, state: 'rejected' } : t
            ))
          },
          onTransferFailed: (fileId, peerDeviceId, message) => {
            setTransfers(prev => prev.map(t =>
              t.id === fileId && t.peerDeviceId === peerDeviceId
                ? { ...t, state: 'failed', errorMessage: message } : t
            ))
          },
          onConnectionFailed: (peerDeviceId, message) => {
            setTransfers(prev => prev.map(t =>
              t.peerDeviceId === peerDeviceId && (t.state === 'pending' || t.state === 'transferring')
                ? { ...t, state: 'failed', errorMessage: message } : t
            ))
            setReadyPeerIds(prev => {
              if (!prev.has(peerDeviceId)) return prev
              const next = new Set(prev)
              next.delete(peerDeviceId)
              return next
            })
          },
          onPeerReady: (peerDeviceId) => {
            setReadyPeerIds(prev => {
              if (prev.has(peerDeviceId)) return prev
              const next = new Set(prev)
              next.add(peerDeviceId)
              return next
            })
          },
          onDeviceProfile: (peerDeviceId, profile) => {
            setDeviceProfiles(prev => {
              const next = new Map(prev)
              next.set(peerDeviceId, profile)
              return next
            })
          },
        },
      )
      managerRef.current = manager

      unsubscribers.push(signaling.onStatus((s) => {
        if (s === 'open') {
          signaling.send({ type: 'join', roomId, deviceId, nickname })
        }
        if (s === 'closed' && !cancelled) {
          setStatus('error')
          setErrorMessage('信令连接已断开')
        }
      }))

      unsubscribers.push(signaling.on('joined', (msg: Extract<SignalingInbound, { type: 'joined' }>) => {
        setPeers(msg.peers)
        setStatus('joined')
      }))
      unsubscribers.push(signaling.on('peer-joined', (msg: Extract<SignalingInbound, { type: 'peer-joined' }>) => {
        setPeers(prev => prev.find(p => p.deviceId === msg.peer.deviceId) ? prev : [...prev, msg.peer])
      }))
      unsubscribers.push(signaling.on('peer-left', (msg: Extract<SignalingInbound, { type: 'peer-left' }>) => {
        setPeers(prev => prev.filter(p => p.deviceId !== msg.deviceId))
        setReadyPeerIds(prev => {
          if (!prev.has(msg.deviceId)) return prev
          const next = new Set(prev)
          next.delete(msg.deviceId)
          return next
        })
        setDeviceProfiles(prev => {
          if (!prev.has(msg.deviceId)) return prev
          const next = new Map(prev)
          next.delete(msg.deviceId)
          return next
        })
      }))
      unsubscribers.push(signaling.on('error', (msg: Extract<SignalingInbound, { type: 'error' }>) => {
        setErrorMessage(`${msg.code}: ${msg.message}`)
        setStatus('error')
      }))
    })()

    return () => {
      cancelled = true
      unsubscribers.forEach(fn => fn())
      managerRef.current?.closeAll()
      signaling.send({ type: 'leave' })
      signaling.close()
    }
  }, [roomId, deviceId, nickname, upsertTransfer])

  const acceptIncoming = useCallback(() => {
    if (!incoming) return
    incoming.resolve(true)
    upsertTransfer({
      id: incoming.offer.fileId,
      direction: 'receive',
      peerDeviceId: incoming.peer.deviceId,
      peerNickname: incoming.peer.nickname,
      fileName: incoming.offer.name,
      size: incoming.offer.size,
      state: 'transferring',
      bytesTransferred: 0,
    })
    setIncoming(null)
  }, [incoming, upsertTransfer])

  const rejectIncoming = useCallback(() => {
    if (!incoming) return
    incoming.resolve(false)
    setIncoming(null)
  }, [incoming])

  const sendFileTo = useCallback((peerDeviceId: string, file: File) => {
    if (mockEnabledRef.current) {
      mockRef.current?.sendFile(peerDeviceId, file, peersRef.current)
      return
    }
    managerRef.current?.sendFile(peerDeviceId, file).catch(err => {
      setErrorMessage((err as Error).message)
    })
    const peer = peersRef.current.find(p => p.deviceId === peerDeviceId)
    upsertTransfer({
      id: 'pending-' + Date.now(),
      direction: 'send',
      peerDeviceId,
      peerNickname: peer?.nickname ?? peerDeviceId,
      fileName: file.name,
      size: file.size,
      state: 'pending',
      bytesTransferred: 0,
    })
  }, [upsertTransfer])

  const broadcastFile = useCallback((file: File) => {
    if (mockEnabledRef.current) {
      mockRef.current?.broadcastFile(file, peersRef.current)
      return
    }
    managerRef.current?.broadcastFile(peersRef.current, file)
  }, [])

  const sendControlTo = useCallback((peerDeviceId: string, msg: ControlMessage): boolean => {
    if (mockEnabledRef.current) {
      // mock 模式下不发真实控制消息；profile 同步由 mockOrchestrator 通过 setMockDeviceProfile 注入
      return true
    }
    return managerRef.current?.sendControl(peerDeviceId, msg) ?? false
  }, [])

  const setMockDeviceProfile = useCallback((deviceId: string, profile: DeviceProfile) => {
    setDeviceProfiles(prev => {
      const next = new Map(prev)
      next.set(deviceId, profile)
      return next
    })
  }, [])

  const leave = useCallback(() => {
    if (mockEnabledRef.current) {
      mockRef.current?.cleanup()
      return
    }
    signalingRef.current?.send({ type: 'leave' })
    signalingRef.current?.close()
    managerRef.current?.closeAll()
  }, [])

  return {
    status,
    errorMessage,
    selfDeviceId: deviceId,
    peers,
    transfers,
    incoming,
    deviceProfiles,
    readyPeerIds,
    acceptIncoming,
    rejectIncoming,
    sendFileTo,
    broadcastFile,
    sendControlTo,
    setMockDeviceProfile,
    leave,
  }
}
