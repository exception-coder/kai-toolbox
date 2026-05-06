import { useEffect, useState } from 'react'
import type { Transfer } from '../../types'

interface Point { x: number; y: number }

interface Props {
  selfPoint: Point                           // 像素坐标
  peerPoints: Map<string, Point>             // deviceId -> 像素坐标
  transfers: Transfer[]
  width: number
  height: number
}

export function ConnectionLayer({ selfPoint, peerPoints, transfers, width, height }: Props) {
  const reduceMotion = usePrefersReducedMotion()
  if (width <= 0 || height <= 0) return null

  // 一对 (peerId, direction) 只画一根线，状态以最近一条 transfer 为准
  type Line = {
    key: string
    peerId: string
    state: Transfer['state']
    progress: number
  }
  const lineByPeer = new Map<string, Line>()
  for (const t of transfers) {
    if (t.state === 'completed' || t.state === 'rejected') continue
    const existing = lineByPeer.get(t.peerDeviceId)
    const progress = t.size > 0 ? t.bytesTransferred / t.size : 0
    if (!existing || statePriority(t.state) > statePriority(existing.state)) {
      lineByPeer.set(t.peerDeviceId, {
        key: `${t.peerDeviceId}-${t.state}`,
        peerId: t.peerDeviceId,
        state: t.state,
        progress,
      })
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {Array.from(lineByPeer.values()).map(line => {
        const peer = peerPoints.get(line.peerId)
        if (!peer) return null
        const cls = lineClass(line.state)
        const d = `M ${selfPoint.x} ${selfPoint.y} L ${peer.x} ${peer.y}`
        return (
          <g key={line.key}>
            <path d={d} className={cls} />
            {line.state === 'transferring' && !reduceMotion && (
              <Particles d={d} />
            )}
          </g>
        )
      })}
    </svg>
  )
}

function statePriority(s: Transfer['state']): number {
  switch (s) {
    case 'failed': return 4
    case 'transferring': return 3
    case 'pending': return 2
    case 'completed': return 1
    case 'rejected': return 0
  }
}

function lineClass(state: Transfer['state']): string {
  switch (state) {
    case 'pending': return 'lanshare-line-pending'
    case 'transferring': return 'lanshare-line-transferring'
    case 'failed': return 'lanshare-line-failed'
    default: return 'lanshare-line-completed'
  }
}

function Particles({ d }: { d: string }) {
  // 沿 path 移动 3 个错峰粒子
  const begins = ['0s', '0.6s', '1.2s']
  return (
    <>
      {begins.map(b => (
        <circle key={b} r="3" className="lanshare-particle">
          <animateMotion dur="1.8s" repeatCount="indefinite" path={d} begin={b} />
        </circle>
      ))}
    </>
  )
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduce(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduce
}
