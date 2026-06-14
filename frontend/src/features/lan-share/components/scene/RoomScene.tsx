import { useMemo, useRef, useState } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import type { ConnectionLinkType, DeviceKind, DeviceProfile, Peer, Transfer } from '../../types'
import { useDeviceLayout, useViewportSize } from '../../hooks/useDeviceLayout'
import { useSceneInteractions } from '../../hooks/useSceneInteractions'
import { DeviceAvatar, type AvatarState } from './DeviceAvatar'
import { ConnectionLayer } from './ConnectionLayer'
import { BroadcastButton } from './BroadcastButton'
import { TargetActionPanel } from './TargetActionPanel'
import { SelfKindPicker } from './SelfKindPicker'
import './scene.css'

interface Props {
  selfDeviceId: string
  selfNickname: string
  selfProfile: DeviceProfile
  peers: Peer[]
  deviceProfiles: Map<string, DeviceProfile>
  readyPeerIds: Set<string>
  connectionTypes: Map<string, ConnectionLinkType>
  transfers: Transfer[]
  onSendFileTo: (peerDeviceId: string, file: File) => void
  onBroadcastFile: (file: File) => void
  onChangeSelfKind: (kind: DeviceKind) => void
}

const SOFT_LIMIT_BYTES = 1024 * 1024 * 1024 // 1GB

export function RoomScene({
  selfDeviceId, selfNickname, selfProfile,
  peers, deviceProfiles, readyPeerIds, connectionTypes, transfers,
  onSendFileTo, onBroadcastFile, onChangeSelfKind,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const { w, h } = useViewportSize(stageRef)
  const peerCount = peers.length + 1
  const { mode, positions } = useDeviceLayout({ peerCount, width: w, height: h })

  const [pickerOpen, setPickerOpen] = useState(false)
  const confirm = useConfirm()

  const largeFileGuard = async (file: File): Promise<boolean> => {
    if (file.size <= SOFT_LIMIT_BYTES) return true
    return await confirm({
      title: '大文件提示',
      description: `文件 ${(file.size / (1 << 30)).toFixed(2)} GB 较大，浏览器内存可能不足，确定继续吗?`,
      confirmText: '继续发送',
    })
  }

  const interactions = useSceneInteractions({
    selfDeviceId,
    onPickFileForTarget: (peer, file) => onSendFileTo(peer.deviceId, file),
    onPickFileForBroadcast: file => onBroadcastFile(file),
    onLargeFileConfirm: largeFileGuard,
  })

  // 计算每个 peer 的状态（基于 transfers 与 readyPeerIds）
  const peerStateMap = useMemo(() => {
    const map = new Map<string, AvatarState>()
    for (const peer of peers) {
      map.set(peer.deviceId, computeAvatarState(peer.deviceId, transfers, readyPeerIds))
    }
    return map
  }, [peers, transfers, readyPeerIds])

  const peerProgressMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of transfers) {
      if (t.state !== 'transferring') continue
      const ratio = t.size > 0 ? t.bytesTransferred / t.size : 0
      const prev = map.get(t.peerDeviceId)
      if (prev === undefined || ratio < prev) map.set(t.peerDeviceId, ratio)
    }
    return map
  }, [transfers])

  // 像素坐标（用于 ConnectionLayer 画线）
  const pixelPositions = useMemo(() => {
    return positions.map(p => ({ x: p.x * w, y: p.y * h }))
  }, [positions, w, h])

  const selfPixel = pixelPositions[0] ?? { x: 0, y: 0 }
  const peerPixelMap = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    peers.forEach((peer, i) => {
      const pos = pixelPositions[i + 1]
      if (pos) map.set(peer.deviceId, pos)
    })
    return map
  }, [peers, pixelPositions])

  return (
    <div
      ref={stageRef}
      className="relative w-full overflow-hidden rounded-2xl border bg-gradient-to-b from-[var(--color-muted)]/40 to-transparent"
      style={{ minHeight: 360, height: 'calc(100vh - 280px)', maxHeight: 720 }}
    >
      {/* 连线层 */}
      <ConnectionLayer
        selfPoint={selfPixel}
        peerPoints={peerPixelMap}
        transfers={transfers}
        width={w}
        height={h}
      />

      {/* 设备拟物 */}
      {positions.map((pos, idx) => {
        if (idx === 0) {
          // 本机
          const selfState: AvatarState = peers.length === 0 ? 'idle' : 'connected'
          return (
            <PositionedAvatar key="self" pos={pos} containerW={w} containerH={h}>
              <DeviceAvatar
                kind={selfProfile.kind}
                nickname={selfNickname}
                isSelf
                state={selfState}
                size={mode === 'grid' ? 56 : 72}
                onLongPress={() => setPickerOpen(true)}
              />
            </PositionedAvatar>
          )
        }
        const peer = peers[idx - 1]
        if (!peer) return null
        const profile = deviceProfiles.get(peer.deviceId)
        const state = peerStateMap.get(peer.deviceId) ?? 'idle'
        const progress = peerProgressMap.get(peer.deviceId)
        const linkType = connectionTypes.get(peer.deviceId)
        return (
          <PositionedAvatar key={peer.deviceId} pos={pos} containerW={w} containerH={h}>
            <DeviceAvatar
              kind={profile?.kind ?? 'unknown'}
              nickname={peer.nickname}
              isSelf={false}
              state={state}
              progress={progress}
              size={mode === 'grid' ? 52 : 64}
              connectionType={state === 'connecting' ? undefined : linkType}
              onClick={() => interactions.selectTarget(peer)}
              shaking={state === 'failed'}
            />
          </PositionedAvatar>
        )
      })}

      {/* 群发按钮：居中浮在自己设备上方 */}
      {peers.length > 0 && (
        <div
          className="absolute z-20"
          style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)' }}
        >
          <BroadcastButton peerCount={peers.length} onPick={interactions.pickFileForBroadcast} />
        </div>
      )}

      {/* 0 peer 时的提示 */}
      {peers.length === 0 && (
        <div className="absolute inset-x-0 bottom-6 text-center text-sm text-[var(--color-muted-foreground)]">
          长按本机可切换设备类型 · 输入相同房间号让其他设备加入
        </div>
      )}

      {/* 隐藏的两个 file input */}
      <input
        ref={interactions.targetInputRef}
        type="file"
        className="hidden"
        onChange={interactions.onTargetFileChange}
      />
      <input
        ref={interactions.broadcastInputRef}
        type="file"
        className="hidden"
        onChange={interactions.onBroadcastFileChange}
      />

      <TargetActionPanel
        open={interactions.isPanelOpen}
        target={interactions.selectedTarget}
        targetProfile={interactions.selectedTarget ? deviceProfiles.get(interactions.selectedTarget.deviceId) : undefined}
        isPeerReady={interactions.selectedTarget ? readyPeerIds.has(interactions.selectedTarget.deviceId) : false}
        onClose={interactions.closePanel}
        onPickFile={interactions.pickFileForTarget}
      />

      <SelfKindPicker
        open={pickerOpen}
        current={selfProfile.kind}
        onClose={() => setPickerOpen(false)}
        onPick={onChangeSelfKind}
      />
    </div>
  )
}

function PositionedAvatar({
  pos, containerW, containerH, children,
}: {
  pos: { x: number; y: number; scale: number }
  containerW: number
  containerH: number
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute z-10"
      style={{
        left: pos.x * containerW,
        top: pos.y * containerH,
        transform: `translate(-50%, -50%) scale(${pos.scale})`,
      }}
    >
      {children}
    </div>
  )
}

function computeAvatarState(
  peerDeviceId: string,
  transfers: Transfer[],
  readyPeerIds: Set<string>,
): AvatarState {
  // 优先检查活跃 transfer 状态
  let active: AvatarState | null = null
  for (const t of transfers) {
    if (t.peerDeviceId !== peerDeviceId) continue
    if (t.state === 'transferring') return 'transferring'
    if (t.state === 'pending' && active !== 'failed') active = 'connecting'
    if (t.state === 'failed') active = 'failed'
  }
  if (active) return active
  return readyPeerIds.has(peerDeviceId) ? 'connected' : 'connecting'
}
