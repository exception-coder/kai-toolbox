import { useEffect, useState } from 'react'
import { useChatRuntime } from '../runtime/ChatRuntimeContext'
import type { UseClaudeChatSocket } from '../hooks/useClaudeChatSocket'
import { getPendingRequest, submitPendingDecision } from '../api'
import { QuestionDialog } from './QuestionDialog'
import type { Question } from '../types'

/**
 * 跨会话自动答题：只要「非当前打开会话」有未决 AskUserQuestion，就在任意模块/页面自动弹出
 * 可视化选项弹窗，选完直接提交，不需要先点「去确认」跳回那个会话才能看到题面——用户原话：
 * "弹出了我们做了选择就自动回复就行了"。
 *
 * 只处理 kind='question'（AskUserQuestion 本身就是自包含的选择题，答案不依赖当前上下文）；
 * kind='permission' 请求通常带工具入参（如具体 bash 命令），仍保留原来"横幅 + 跳转到会话核实"
 * 的路径，不做盲批。
 *
 * 挂在 App.tsx 顶层（ChatRuntimeProvider 内、跨路由常驻），与 FloatingChatWindow 同级。
 */
export function GlobalPendingQuestionModal() {
  const { chat } = useChatRuntime()
  if (!chat) return null
  return <Inner chat={chat} />
}

function Inner({ chat }: { chat: UseClaudeChatSocket }) {
  const target = chat.pendingSessions.find(s => s.kind === 'question' && s.sessionId !== chat.sessionId) ?? null

  const [detail, setDetail] = useState<{ sessionId: string; reqId: string; questions: Question[]; label: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!target) { setDetail(null); return }
    let alive = true
    getPendingRequest(target.sessionId).then(msg => {
      if (!alive) return
      if (msg && msg.type === 'questionRequest') {
        setDetail({ sessionId: target.sessionId, reqId: msg.reqId, questions: msg.questions, label: target.title || target.cwd })
      } else {
        // 已被别的端处理，或读取时机撞上了状态切换：不展示，等下一次 pendingSessions 广播更新
        setDetail(null)
      }
    }).catch(() => setDetail(null))
    return () => { alive = false }
    // chat.pendingSessions 引用每次广播都会变，借它触发"同一会话又来了新问题"时的重新拉取
  }, [target?.sessionId, chat.pendingSessions])

  if (!detail) return null

  const decide = async (behavior: 'allow' | 'deny', answers?: Record<string, string | string[]>) => {
    if (submitting) return
    setSubmitting(true)
    try {
      await submitPendingDecision(detail.sessionId, { reqId: detail.reqId, behavior, answers })
      setDetail(null)
    } catch (e) {
      console.error('[claude-chat] 跨会话答题提交失败', e)
      setSubmitting(false)
    }
  }

  return (
    <QuestionDialog
      questions={detail.questions}
      sourceLabel={detail.label}
      onCancel={() => void decide('deny')}
      onSubmit={answers => void decide('allow', answers)}
    />
  )
}
