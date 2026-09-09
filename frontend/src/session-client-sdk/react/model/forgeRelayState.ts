import type { ConnectionState, PublicMessage, PublicSession, SessionClientEvent } from '../../types'
import { z } from 'zod'

export const relayQuestionSchema = z.object({
  requestId: z.string(),
  questions: z.array(z.object({
    question: z.string(), header: z.string().optional(), multiSelect: z.boolean().optional(),
    options: z.array(z.object({ label: z.string(), description: z.string().optional() })).nullable().optional(),
  })),
})
export type RelayQuestion = z.infer<typeof relayQuestionSchema>
export interface RelayView {
  streaming?: boolean
  connection: ConnectionState
  session?: PublicSession
  messages: PublicMessage[]
  question?: RelayQuestion
  progress: string
  error: string
}
export const initialRelayView: RelayView = { connection: 'idle', messages: [], progress: '', error: '' }
const messageSchema = z.object({ role: z.enum(['user', 'assistant']), text: z.string(), messageId: z.string().nullable().optional() })
const progressSchema = z.object({ phase: z.string().nullable().optional(), status: z.string().nullable().optional(),
  currentTaskId: z.string().nullable().optional(), completedTasks: z.number().nullable().optional(), totalTasks: z.number().nullable().optional() })

/** 只投影公共事件字段，不展示原始工具或错误数据。 */
export function applyRelayEvent(view: RelayView, event: SessionClientEvent): RelayView {
  if (event.error) return { ...view, error: event.error.message }
  if (event.type === 'businessQuestion') {
    const parsed = relayQuestionSchema.safeParse(event.data)
    return parsed.success ? { ...view, question: parsed.data } : { ...view, error: '问题格式无法识别，请联系会话所有者。' }
  }
  if (event.type === 'message') {
    const parsed = messageSchema.safeParse(event.data)
    if (!parsed.success) return view
    const message = parsed.data
    const previous = view.messages.at(-1)
    if (message.role === 'assistant' && !message.messageId && previous?.role === 'assistant' && view.streaming) {
      return { ...view, messages: [...view.messages.slice(0, -1), { ...previous, text: previous.text + message.text }] }
    }
    const id = message.messageId ?? event.eventId ?? `event-${event.seq}`
    if (view.messages.some(item => item.id === id)) return view
    return { ...view, streaming: message.role === 'assistant', messages: [...view.messages, { id, role: message.role, text: message.text }].slice(-100) }
  }
  if (event.type === 'progress') {
    const parsed = progressSchema.safeParse(event.data)
    if (!parsed.success) return view
    const progress = parsed.data
    const count = progress.totalTasks == null ? '' : `${progress.completedTasks ?? 0}/${progress.totalTasks}`
    return { ...view, progress: [progress.phase, progress.status, progress.currentTaskId, count].filter(Boolean).join(' · ') }
  }
  if (event.type === 'completed') return { ...view, progress: '本轮处理结束', streaming: false, question: undefined }
  if (event.type === 'blocked') return { ...view, progress: '处理受阻，请联系会话所有者' }
  if (event.type === 'replayGap') return { ...view, error: '部分消息未能恢复，请重新加载历史消息。' }
  return view
}
