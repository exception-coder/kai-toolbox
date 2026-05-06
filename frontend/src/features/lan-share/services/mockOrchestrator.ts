import type { Peer, FileOffer, Transfer, DeviceProfile, DeviceKind } from '../types'
import { triggerBrowserDownload } from './fileTransfer'

export interface MockOrchestratorDeps {
  setStatus: (s: 'connecting' | 'joined' | 'error') => void
  setPeers: (updater: (peers: Peer[]) => Peer[]) => void
  setIncoming: (incoming: {
    peer: Peer
    offer: FileOffer
    resolve: (accept: boolean) => void
  } | null) => void
  upsertTransfer: (t: Transfer) => void
  setMockDeviceProfile: (deviceId: string, profile: DeviceProfile) => void
}

interface MockOrchestrator {
  sendFile(peerDeviceId: string, file: File, peers: Peer[]): void
  broadcastFile(file: File, peers: Peer[]): void
  cleanup(): void
}

interface MockPeerDef {
  peer: Peer
  kind: DeviceKind
}

const PHONE: MockPeerDef = {
  peer: { deviceId: 'mock-phone', nickname: '虚拟手机', joinedAt: 0 },
  kind: 'iphone',
}
const TABLET: MockPeerDef = {
  peer: { deviceId: 'mock-tablet', nickname: '虚拟笔记本', joinedAt: 0 },
  kind: 'mac',
}

const SEND_TICK_MS = 80
const SEND_TICKS = 25            // 总耗时 ≈ 2 秒
const INCOMING_DEMO_DELAY_MS = 3000

export function createMockOrchestrator(deps: MockOrchestratorDeps): MockOrchestrator {
  const timers = new Set<number>()

  const setTimer = (fn: () => void, ms: number): void => {
    const id = window.setTimeout(() => { timers.delete(id); fn() }, ms)
    timers.add(id)
  }

  const setIntervalTracked = (fn: () => boolean | void, ms: number): void => {
    const id = window.setInterval(() => {
      const stop = fn()
      if (stop) {
        window.clearInterval(id)
        timers.delete(id)
      }
    }, ms)
    timers.add(id)
  }

  // 阶段 1：立即进入 joined 状态
  deps.setStatus('joined')

  // 阶段 2：0.4s 后虚拟手机上线，并注入设备画像
  setTimer(() => {
    const peer: Peer = { ...PHONE.peer, joinedAt: Date.now() }
    deps.setPeers(prev => prev.find(p => p.deviceId === peer.deviceId) ? prev : [...prev, peer])
    deps.setMockDeviceProfile(peer.deviceId, { kind: PHONE.kind })
  }, 400)

  // 阶段 3：1.0s 后虚拟笔记本上线，并注入设备画像
  setTimer(() => {
    const peer: Peer = { ...TABLET.peer, joinedAt: Date.now() }
    deps.setPeers(prev => prev.find(p => p.deviceId === peer.deviceId) ? prev : [...prev, peer])
    deps.setMockDeviceProfile(peer.deviceId, { kind: TABLET.kind })
  }, 1000)

  // 阶段 4：3s 后虚拟手机主动给你发一份演示文件
  setTimer(() => {
    const content = [
      '这是来自虚拟手机的演示文件。',
      '',
      `生成时间：${new Date().toLocaleString('zh-CN')}`,
      '',
      '在 mock 模式下，这是一次完整的「接收 → 接受 → 下载」流程演示。',
      '关闭 mock 模式后会通过真实 WebRTC DataChannel 传输。',
    ].join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const offer: FileOffer = {
      fileId: 'mock-in-' + Date.now(),
      name: '来自虚拟手机.txt',
      size: blob.size,
      mime: 'text/plain',
      totalChunks: 1,
    }
    const peer: Peer = { ...PHONE.peer, joinedAt: Date.now() }
    deps.setIncoming({
      peer,
      offer,
      resolve: (accept) => {
        deps.setIncoming(null)
        if (!accept) {
          deps.upsertTransfer({
            id: offer.fileId,
            direction: 'receive',
            peerDeviceId: peer.deviceId,
            peerNickname: peer.nickname,
            fileName: offer.name,
            size: offer.size,
            state: 'rejected',
            bytesTransferred: 0,
          })
          return
        }
        triggerBrowserDownload(blob, offer.name)
        deps.upsertTransfer({
          id: offer.fileId,
          direction: 'receive',
          peerDeviceId: peer.deviceId,
          peerNickname: peer.nickname,
          fileName: offer.name,
          size: offer.size,
          state: 'completed',
          bytesTransferred: offer.size,
        })
      },
    })
  }, INCOMING_DEMO_DELAY_MS)

  function simulateSend(targetDeviceId: string, file: File, peers: Peer[]): void {
    const target = peers.find(p => p.deviceId === targetDeviceId)
    const fileId = 'mock-out-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
    const total = file.size
    const step = Math.max(Math.ceil(total / SEND_TICKS), 1)
    let sent = 0

    deps.upsertTransfer({
      id: fileId,
      direction: 'send',
      peerDeviceId: targetDeviceId,
      peerNickname: target?.nickname ?? targetDeviceId,
      fileName: file.name,
      size: total,
      state: 'transferring',
      bytesTransferred: 0,
    })

    setIntervalTracked(() => {
      sent = Math.min(sent + step, total)
      const done = sent >= total
      deps.upsertTransfer({
        id: fileId,
        direction: 'send',
        peerDeviceId: targetDeviceId,
        peerNickname: target?.nickname ?? targetDeviceId,
        fileName: file.name,
        size: total,
        state: done ? 'completed' : 'transferring',
        bytesTransferred: sent,
      })
      return done
    }, SEND_TICK_MS)
  }

  return {
    sendFile(peerDeviceId, file, peers) {
      simulateSend(peerDeviceId, file, peers)
    },
    broadcastFile(file, peers) {
      peers.forEach(p => simulateSend(p.deviceId, file, peers))
    },
    cleanup() {
      for (const id of timers) {
        window.clearTimeout(id)
        window.clearInterval(id)
      }
      timers.clear()
    },
  }
}
