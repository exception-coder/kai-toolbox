import { useCallback, useRef, useState } from 'react'
import type { Peer } from '../types'

export interface UseSceneInteractionsArgs {
  selfDeviceId: string
  onPickFileForTarget: (peer: Peer, file: File) => void
  onPickFileForBroadcast: (file: File) => void
  onLargeFileConfirm?: (file: File) => Promise<boolean>
}

export interface UseSceneInteractionsResult {
  selectedTarget: Peer | null
  isPanelOpen: boolean
  selectTarget: (peer: Peer) => void
  closePanel: () => void
  pickFileForTarget: () => void
  pickFileForBroadcast: () => void
  targetInputRef: React.RefObject<HTMLInputElement | null>
  broadcastInputRef: React.RefObject<HTMLInputElement | null>
  onTargetFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onBroadcastFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

export function useSceneInteractions(args: UseSceneInteractionsArgs): UseSceneInteractionsResult {
  const [selectedTarget, setSelectedTarget] = useState<Peer | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const targetInputRef = useRef<HTMLInputElement | null>(null)
  const broadcastInputRef = useRef<HTMLInputElement | null>(null)

  const selectTarget = useCallback((peer: Peer) => {
    if (peer.deviceId === args.selfDeviceId) return
    setSelectedTarget(peer)
    setIsPanelOpen(true)
  }, [args.selfDeviceId])

  const closePanel = useCallback(() => setIsPanelOpen(false), [])

  const pickFileForTarget = useCallback(() => {
    targetInputRef.current?.click()
  }, [])

  const pickFileForBroadcast = useCallback(() => {
    broadcastInputRef.current?.click()
  }, [])

  const onTargetFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedTarget) return
    const ok = args.onLargeFileConfirm ? await args.onLargeFileConfirm(file) : true
    if (!ok) return
    args.onPickFileForTarget(selectedTarget, file)
    setIsPanelOpen(false)
  }, [selectedTarget, args])

  const onBroadcastFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const ok = args.onLargeFileConfirm ? await args.onLargeFileConfirm(file) : true
    if (!ok) return
    args.onPickFileForBroadcast(file)
  }, [args])

  return {
    selectedTarget,
    isPanelOpen,
    selectTarget,
    closePanel,
    pickFileForTarget,
    pickFileForBroadcast,
    targetInputRef,
    broadcastInputRef,
    onTargetFileChange,
    onBroadcastFileChange,
  }
}
