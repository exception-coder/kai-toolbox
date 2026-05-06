import { useCallback, useEffect, useRef, useState } from 'react'
import type { ControlMessage, DeviceKind, DeviceProfile, Peer } from '../types'
import { getDeviceProfile, setOverride } from '../services/deviceProfile'

export interface UseDeviceProfileExchangeArgs {
  enabled: boolean                                                // false = mock 模式，no-op
  peers: Peer[]
  readyPeerIds: Set<string>
  sendControlTo: (peerDeviceId: string, msg: ControlMessage) => boolean
}

export interface UseDeviceProfileExchangeResult {
  selfProfile: DeviceProfile
  setSelfKind: (kind: DeviceKind | null) => void                  // null = 清除覆盖回到自动识别
  broadcast: () => void                                            // 主动重发给所有 ready peer
}

export function useDeviceProfileExchange(args: UseDeviceProfileExchangeArgs): UseDeviceProfileExchangeResult {
  const [selfProfile, setSelfProfile] = useState<DeviceProfile>(() => getDeviceProfile())
  const sentToRef = useRef<Set<string>>(new Set())
  const profileRef = useRef<DeviceProfile>(selfProfile)
  profileRef.current = selfProfile

  // 对每个新就绪的 peer 发送一次本机 profile
  useEffect(() => {
    if (!args.enabled) return
    for (const id of args.readyPeerIds) {
      if (sentToRef.current.has(id)) continue
      const ok = args.sendControlTo(id, { type: 'device-profile', profile: profileRef.current })
      if (ok) sentToRef.current.add(id)
    }
  }, [args.enabled, args.readyPeerIds, args.sendControlTo])

  // peer 离开后清理 sent set，避免重复加入时遗漏首发
  useEffect(() => {
    const currentIds = new Set(args.peers.map(p => p.deviceId))
    for (const id of Array.from(sentToRef.current)) {
      if (!currentIds.has(id)) sentToRef.current.delete(id)
    }
  }, [args.peers])

  const broadcast = useCallback(() => {
    if (!args.enabled) return
    for (const id of args.readyPeerIds) {
      args.sendControlTo(id, { type: 'device-profile', profile: profileRef.current })
    }
  }, [args.enabled, args.readyPeerIds, args.sendControlTo])

  const setSelfKind = useCallback((kind: DeviceKind | null) => {
    setOverride(kind)
    const next = getDeviceProfile()
    setSelfProfile(next)
    profileRef.current = next
    if (args.enabled) {
      for (const id of args.readyPeerIds) {
        args.sendControlTo(id, { type: 'device-profile', profile: next })
      }
    }
  }, [args.enabled, args.readyPeerIds, args.sendControlTo])

  return { selfProfile, setSelfKind, broadcast }
}
