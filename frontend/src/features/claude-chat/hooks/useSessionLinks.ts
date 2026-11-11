import { useEffect, useRef, useState } from 'react'
import type { NavigateFunction } from 'react-router-dom'
import { getSessionByDevSession, linkDevSession, type PrdSessionView } from '@/features/prd-clarify/public-api'
import { listQuickSiteSummaries } from '@/lib/quickSites'
import { getSessionSiteConfiguration, listSessionProjectDirectories } from '../api'
import { customSiteToLinkedSite, quickSiteToLinkedSite, type SessionLinkedSite } from '../lib/sessionSites'

export interface PendingAutoPrdLink {
  prdSessionId: string
  previousDevSessionId: string | null
  targetDevSessionId?: string
}

/**
 * 当前会话的外部关联：PRD 会话、快捷/自定义站点与项目目录，以及新会话就绪后的 PRD 自动关联。
 * 从 ChatPage 拆出，行为与原实现一致。
 */
export function useSessionLinks(sessionId: string | null | undefined, navigate: NavigateFunction) {
  // PRD handoff 不能靠固定延时读取 sessionId：新会话 ID 由 WebSocket init/ready 异步返回。
  // 记录发起前的旧 ID，等真正出现不同的新 ID 后再执行带鉴权的关联请求。
  const pendingAutoPrdLinkRef = useRef<PendingAutoPrdLink | null>(null)
  const autoPrdLinkInFlightRef = useRef(false)
  // 当前会话关联的 PRD（undefined=还没查/无会话，null=确认未关联），供顶栏标识展示。
  const [linkedPrd, setLinkedPrd] = useState<PrdSessionView | null | undefined>(undefined)
  const [linkedSites, setLinkedSites] = useState<SessionLinkedSite[]>([])
  const [linkedProjectPaths, setLinkedProjectPaths] = useState<string[]>([])
  useEffect(() => {
    if (!sessionId) {
      setLinkedSites([])
      return
    }
    let active = true
    Promise.all([getSessionSiteConfiguration(sessionId), listQuickSiteSummaries()])
      .then(([configuration, sites]) => {
        if (!active) return
        const quickSites = configuration.quickSiteIds.flatMap(id => {
          const site = sites.find(candidate => candidate.id === id && candidate.enabled)
          return site ? [quickSiteToLinkedSite(site)] : []
        })
        setLinkedSites([
          ...quickSites,
          ...configuration.customSites.map(customSiteToLinkedSite),
        ])
      })
      .catch(() => active && setLinkedSites([]))
    return () => { active = false }
  }, [sessionId])
  useEffect(() => {
    if (!sessionId) {
      setLinkedProjectPaths([])
      return
    }
    let active = true
    listSessionProjectDirectories(sessionId)
      .then(paths => active && setLinkedProjectPaths(paths))
      .catch(() => active && setLinkedProjectPaths([]))
    return () => { active = false }
  }, [sessionId])

  useEffect(() => {
    const sid = sessionId
    if (!sid) { setLinkedPrd(undefined); return }
    const pending = pendingAutoPrdLinkRef.current
    if (pending && sid !== pending.previousDevSessionId) {
      // 自动关联尚未完成时不抢先查询“未关联”，成功后由下方 effect 回填权威结果。
      setLinkedPrd(undefined)
      return
    }
    let alive = true
    getSessionByDevSession(sid).then(v => { if (alive) setLinkedPrd(v) }).catch(() => { if (alive) setLinkedPrd(null) })
    return () => { alive = false }
  }, [sessionId])

  useEffect(() => {
    const pending = pendingAutoPrdLinkRef.current
    const devSessionId = sessionId
    if (!pending || !devSessionId || devSessionId === pending.previousDevSessionId) return

    // 通道重连时可能连续收到多个 sessionId。始终记录最新目标，并由单个串行 worker 做“最后一次绑定”，
    // 避免旧请求尚未结束时新 effect 被 inFlight 直接跳过，最终留下有内容但没有 PRD/TDD 关联的会话。
    pending.targetDevSessionId = devSessionId
    if (autoPrdLinkInFlightRef.current) return
    autoPrdLinkInFlightRef.current = true
    const linkLatestTarget = async () => {
      while (pendingAutoPrdLinkRef.current?.targetDevSessionId) {
        const current = pendingAutoPrdLinkRef.current
        const targetDevSessionId = current.targetDevSessionId
        if (!targetDevSessionId) return
        let linked: PrdSessionView | null = null

        for (let attempt = 0; attempt < 4; attempt += 1) {
          // 新 ready 已给出更新的会话 ID：停止重试旧目标，回到 while 绑定最新目标。
          if (pendingAutoPrdLinkRef.current?.targetDevSessionId !== targetDevSessionId) break
          try {
            await linkDevSession(current.prdSessionId, targetDevSessionId)
            linked = await getSessionByDevSession(targetDevSessionId)
            break
          } catch {
            if (attempt < 3) {
              await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
            }
          }
        }

        const latest = pendingAutoPrdLinkRef.current
        if (latest?.targetDevSessionId !== targetDevSessionId) continue
        if (linked) {
          pendingAutoPrdLinkRef.current = null
          setLinkedPrd(linked)
          // 把已确认的双向关系写进路由；刷新可恢复，且之后手工切换会话不会被重新强绑。
          navigate(`/tools/claude-chat?sessionId=${encodeURIComponent(targetDevSessionId)}&prdSessionId=${encodeURIComponent(current.prdSessionId)}`, { replace: true })
          return
        }
        pendingAutoPrdLinkRef.current = null
        setLinkedPrd(null)
        return
      }
    }
    void linkLatestTarget().finally(() => { autoPrdLinkInFlightRef.current = false })
  }, [sessionId, navigate])

  return { linkedPrd, setLinkedPrd, linkedSites, setLinkedSites, linkedProjectPaths, setLinkedProjectPaths, pendingAutoPrdLinkRef }
}
