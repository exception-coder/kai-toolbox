import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useClaudeChatSocket, type UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { getSelfRepo, listSessions, renameSession } from '../api'
import { publishEmergencyRepairStatus, type EmergencyRepairRequest } from '@/lib/emergencyRepair'
import { isVibeCodingSession } from '../lib/sessionScope'
import { clearRecentSessionHint, readRecentSessionHint, saveRecentSessionHint } from '../lib/recentSessionHint'
import { useAuth } from '@/lib/auth'
import { reportVibeEntry } from '@/lib/vibeEntryDiagnostics'

// 独立常驻引擎：仅首次激活后下载，不包裹页面，加载完成不重建外壳或输入草稿。
export const ChatRuntimeEngine = memo(function ChatRuntimeEngine({
  onChat,
  demo,
  emergencyRepair,
  onEmergencyRepairHandled,
}: {
  onChat: (chat: UseClaudeChatSocket) => void
  demo: boolean
  emergencyRepair: EmergencyRepairRequest | null
  onEmergencyRepairHandled: () => void
}) {
  useEffect(() => { reportVibeEntry('chat_engine_mount', 'ok', null, true) }, [])
  const location = useLocation()
  const { user } = useAuth()
  const userId = user?.userId
  const routePrdSessionId = useMemo(
    () => new URLSearchParams(location.search).get('prdSessionId')?.trim() || null,
    [location.search],
  )
  // 离开会话页弹成浮窗后仍保留本次 PRD 授权范围，避免重连退回 ADMIN 通道。
  const [prdSessionId, setPrdSessionId] = useState<string | null>(routePrdSessionId)
  useEffect(() => {
    if (routePrdSessionId) setPrdSessionId(routePrdSessionId)
  }, [routePrdSessionId])
  // 路由参数必须在本次 render 就决定连接通道，不能等上面的 state effect 再切换。
  // 否则“打开已绑定开发会话”会先在 ADMIN 通道发 switch，下一拍才重连 PRD 通道；
  // 首次 switch 的去重标记却被保留，最终左侧有会话、右侧 currentSession 仍为空。
  const effectivePrdSessionId = routePrdSessionId ?? prdSessionId
  const chat = useClaudeChatSocket(demo
    ? { demo: true }
    : effectivePrdSessionId
      ? { channel: 'prd-dev', prdSessionId: effectivePrdSessionId }
      : undefined)
  const targetSessionId = useMemo(
    () => new URLSearchParams(location.search).get('sessionId')?.trim() || null,
    [location.search],
  )
  const handledEmergencyRef = useRef<string | null>(null)
  const pendingEmergencyTitleRef = useRef<{ requestId: string; title: string } | null>(null)
  const autoOpenedRef = useRef(false)

  useEffect(() => {
    if (demo || !emergencyRepair || handledEmergencyRef.current === emergencyRepair.id) return
    handledEmergencyRef.current = emergencyRepair.id
    // 紧急任务自己会选择/创建会话，阻止下面的“恢复最近会话”与它并发抢占当前连接。
    autoOpenedRef.current = true
    const request = emergencyRepair
    void (async () => {
      try {
        const [selfRepo, sessions] = await Promise.all([
          getSelfRepo(),
          listSessions().then(items => items.filter(isVibeCodingSession)),
        ])
        if (!selfRepo.exists || !selfRepo.path?.trim()) throw new Error('未配置 kai-toolbox 自维护仓库，无法创建修复会话')

        const normalizedSelf = normalizePath(selfRepo.path)
        const featureNeedles = [request.featureId.toLowerCase()]
        if (request.featureId === 'claude-chat') featureNeedles.push('vibe coding', 'vibe', 'vb')
        const recentConversation = JSON.stringify(chat.items.slice(-30)).toLowerCase()
        const currentSessionMentionsFeature = featureNeedles.some(needle => recentConversation.includes(needle))
        const reusable = sessions.find(session => {
          if (normalizePath(session.cwd) !== normalizedSelf) return false
          if (!session.live) return false
          const title = session.title?.toLowerCase() || ''
          return title.includes('紧急修复')
            || featureNeedles.some(needle => title.includes(needle))
            || (session.id === chat.sessionId && currentSessionMentionsFeature)
        })
        const title = `[紧急修复][${request.featureId}] ${new Date(request.requestedAt).toLocaleString()}`
        const prompt = buildEmergencyRepairPrompt(request)

        if (reusable) {
          chat.switchTo(reusable.id, reusable.status === 'RUNNING' && reusable.live)
          chat.enqueue(prompt, undefined, `紧急修复 ${request.featureId}：检查异常并立即恢复模块`)
          publishEmergencyRepairStatus({
            id: request.id,
            state: 'started',
            sessionId: reusable.id,
            message: `已找到正在处理该模块的会话“${reusable.title || reusable.id.slice(0, 8)}”，修复指令已强制加入队列。`,
          })
        } else {
          pendingEmergencyTitleRef.current = { requestId: request.id, title }
          chat.open(selfRepo.path, undefined, 'bypassPermissions', chat.currentEngine === 'codex' ? 'codex' : 'claude')
          chat.send(prompt, undefined, `紧急修复 ${request.featureId}：检查异常并立即恢复模块`)
          publishEmergencyRepairStatus({
            id: request.id,
            state: 'started',
            message: '未发现正在修复该模块的活跃会话，已创建全自动临时会话并发出修复指令。',
          })
        }
      } catch (error) {
        handledEmergencyRef.current = null
        publishEmergencyRepairStatus({
          id: request.id,
          state: 'failed',
          message: error instanceof Error ? error.message : '紧急修复会话启动失败',
        })
      } finally {
        onEmergencyRepairHandled()
      }
    })()
  }, [chat, demo, emergencyRepair, onEmergencyRepairHandled])

  useEffect(() => {
    const pendingTitle = pendingEmergencyTitleRef.current
    if (!pendingTitle || !chat.sessionId) return
    pendingEmergencyTitleRef.current = null
    renameSession(chat.sessionId, pendingTitle.title).catch(() => {
      // 标题只用于后续复用识别；改名失败不影响已发出的修复任务。
    })
    publishEmergencyRepairStatus({
      id: pendingTitle.requestId,
      state: 'started',
      sessionId: chat.sessionId,
      message: `全自动临时修复会话 ${chat.sessionId.slice(0, 8)} 已开始执行。`,
    })
  }, [chat.sessionId])

  // 挂载即开一次会话：demo 直接 open（服务端供给受约束副本沙箱，忽略入参）；
  // 正式态优先打开路由指定会话，否则续接最近一条会话。
  const switchedTargetRef = useRef<string | null>(null)
  const chatRef = useRef(chat)
  chatRef.current = chat
  // 同一个目标只自动恢复一次，之后允许用户手动“切换会话”接管其它开发会话；
  // 只有路由目标或 PRD 授权通道真正变化时才解除一次性保护并重新恢复。
  useEffect(() => {
    switchedTargetRef.current = null
  }, [effectivePrdSessionId, targetSessionId])
  useEffect(() => {
    if (autoOpenedRef.current) return
    autoOpenedRef.current = true
    if (demo) {
      // 全自动：受约束演示无人审批，权限模式直接 bypassPermissions（工具放行仍由沙箱 canUseTool 兜底）。
      chatRef.current.open('', undefined, 'bypassPermissions')
      return
    }
    if (targetSessionId) {
      switchedTargetRef.current = targetSessionId
      void (async () => {
        try {
          reportVibeEntry('session_lookup', 'start', targetSessionId)
          const target = (await listSessions()).find(
            session => session.id === targetSessionId && isVibeCodingSession(session),
          )
          reportVibeEntry('session_lookup', 'ok', targetSessionId)
          if (!target || switchedTargetRef.current !== targetSessionId) return
          chatRef.current.switchTo(target.id, target.status === 'RUNNING' && target.live)
        } catch {
          reportVibeEntry('session_lookup', 'error', targetSessionId)
          // 无法确认会话归属时不绑定，避免业务咨询会话误入 Vibe Coding。
        }
      })()
      return
    }
    // 需求代码节点的新开发 handoff 会由 ChatPage 立即 open；不要先自动切到“最近会话”，
    // 否则负责人范围通道会正确拒绝那条无关会话，并在界面上产生一次误导性的报错。
    if (effectivePrdSessionId) return
    const hintedSessionId = userId == null ? null : readRecentSessionHint(userId)
    if (hintedSessionId) chatRef.current.switchTo(hintedSessionId)
    reportVibeEntry('session_lookup', 'start', hintedSessionId)
    void (async () => {
      try {
        const sessions = (await listSessions()).filter(isVibeCodingSession)
        reportVibeEntry('session_lookup', 'ok', hintedSessionId)
        if (sessions.length === 0) {
          if (userId != null) clearRecentSessionHint(userId)
          return
        }
        const latest = [...sessions].sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        const hintedSession = sessions.find(session => session.id === hintedSessionId)
        if (chatRef.current.sessionId !== hintedSessionId) return
        if (hintedSession && latest.id === hintedSessionId) {
          if (userId != null) saveRecentSessionHint(userId, hintedSessionId!)
          return
        }
        if (userId != null) saveRecentSessionHint(userId, latest.id)
        // 刷新恢复：若该会话仍在回答（后端 status=RUNNING 且挂在活跃 sidecar 上），带上 hint 立即显示「中断」，
        // 避免页面还没感知到就误显示发送按钮。Ready 回来会校正。
        chatRef.current.switchTo(latest.id, latest.status === 'RUNNING' && latest.live)
      } catch {
        reportVibeEntry('session_lookup', 'error', hintedSessionId)
        // 列表拉取失败：保持空态，用户可手动新建/选择
      }
    })()
  }, [demo, targetSessionId, effectivePrdSessionId, userId])

  useEffect(() => {
    if (demo || !targetSessionId || switchedTargetRef.current === targetSessionId) return
    switchedTargetRef.current = targetSessionId
    void (async () => {
      try {
        const target = (await listSessions()).find(
          session => session.id === targetSessionId && isVibeCodingSession(session),
        )
        if (!target || switchedTargetRef.current !== targetSessionId) return
        chatRef.current.switchTo(target.id, target.status === 'RUNNING' && target.live)
      } catch {
        reportVibeEntry('session_lookup', 'error', targetSessionId)
        // 无法确认会话归属时保持当前开发会话。
      }
    })()
  }, [demo, effectivePrdSessionId, targetSessionId])

  // 兼容升级前已经误绑定的页面状态：识别到当前 ID 属于业务咨询后，立即回到最近的开发会话。
  useEffect(() => {
    const activeSessionId = chat.sessionId
    if (demo || !activeSessionId) return
    let cancelled = false
    void (async () => {
      try {
        const sessions = await listSessions()
        const active = sessions.find(session => session.id === activeSessionId)
        if (!active) return
        if (isVibeCodingSession(active)) {
          if (!cancelled && userId != null) saveRecentSessionHint(userId, active.id)
          return
        }
        const fallback = sessions
          .filter(isVibeCodingSession)
          .sort((a, b) => b.lastSeenAt - a.lastSeenAt)[0]
        if (!cancelled && fallback) {
          chatRef.current.switchTo(fallback.id, fallback.status === 'RUNNING' && fallback.live)
        }
      } catch {
        // 后端通道仍会拒绝跨域绑定；列表查询失败时不做猜测性切换。
      }
    })()
    return () => { cancelled = true }
  }, [demo, chat.sessionId, userId])

  useLayoutEffect(() => { onChat(chat) }, [chat, onChat])
  return null
})

function normalizePath(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

function buildEmergencyRepairPrompt(request: EmergencyRepairRequest): string {
  return `这是 kai-toolbox 的紧急自修复任务，请立即执行，不要只给建议。

故障模块：${request.featureId}
故障路由：${request.route}
浏览器错误：${request.errorName}: ${request.errorMessage}

执行要求：
1. 先检查是否已有会话或未提交改动正在修改 Vibe Coding / ${request.featureId} 模块，理解并保留这些增量；严禁 git reset、checkout 覆盖、删除用户改动或擅自提交。
2. 结合错误信息定位真正根因，直接修复模块。若是导入/导出不一致，核对调用端与实际实现，不能只用刷新页面规避。
3. 优先恢复页面可用性，同时检查移动端与相关调用链不再触发同类异常。
4. 至少运行 frontend typecheck；涉及后端或 sidecar 时补充对应编译/测试。
5. 完成后明确说明修改文件、根因、验证结果；如受阻，给出可执行的失败原因。

这是临时紧急会话，请现在开始检查并修复。`
}
