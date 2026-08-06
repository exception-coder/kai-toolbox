import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { expireSessionPlan, unlockSessionPlan } from '../api'
import type { ClaudeChatSessionView } from '../types'

const SESSION_QUERY_KEY = ['claude-chat-sessions']

/** 统一规划过期、解锁确认和会话缓存刷新。 */
export function useSessionPlanState() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [busyId, setBusyId] = useState<string | null>(null)

  /** 标记空闲会话规划过期。 */
  const expire = async (session: ClaudeChatSessionView) => {
    if (session.status === 'RUNNING' && session.live) return
    const title = session.title?.trim() || '未命名会话'
    const accepted = await confirm({
      title: '标记规划过期？',
      description: `会话“${title}”将变为只读，必须显式解锁后才能继续发送消息。`,
      confirmText: '标记过期',
      cancelText: '取消',
    })
    if (!accepted) return
    setBusyId(session.id)
    try {
      await expireSessionPlan(session.id)
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    } catch (error) {
      await showFailure(confirm, '标记失败', error)
    } finally {
      setBusyId(null)
    }
  }

  /** 显式解锁过期规划。 */
  const unlock = async (session: ClaudeChatSessionView) => {
    const title = session.title?.trim() || '未命名会话'
    const accepted = await confirm({
      title: '解锁过期规划？',
      description: `解锁“${title}”后将恢复输入和发送能力。请确认这份规划仍然有效。`,
      confirmText: '确认解锁',
      cancelText: '保持锁定',
    })
    if (!accepted) return
    setBusyId(session.id)
    try {
      await unlockSessionPlan(session.id)
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
    } catch (error) {
      await showFailure(confirm, '解锁失败', error)
    } finally {
      setBusyId(null)
    }
  }

  return { busyId, expire, unlock }
}

/** 使用项目统一确认框展示操作失败原因。 */
async function showFailure(
  confirm: ReturnType<typeof useConfirm>,
  title: string,
  error: unknown,
) {
  await confirm({
    title,
    description: error instanceof Error ? error.message : '请求失败，请稍后重试。',
    confirmText: '知道了',
    cancelText: '关闭',
    variant: 'destructive',
  })
}
