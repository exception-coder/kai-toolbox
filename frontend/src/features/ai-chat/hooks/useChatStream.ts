import { useCallback, useRef, useState } from 'react'
import { sendMessage, stopCompletion, subscribeCompletion } from '../api'
import type { DonePayload, SendMessageBody } from '../types'

interface StreamCallbacks {
  /** 收到终止事件（含完整内容）。用于把流式气泡定稿为一条助手消息。 */
  onFinal: (payload: DonePayload) => void
  /** 4sapi 调用出错的提示文案。 */
  onError: (message: string) => void
}

/**
 * 封装「发送 → 订阅 SSE token 流 → 停止」。
 * 后端在客户端打开 SSE 后才真正开始流式，故 send 内先 POST 拿 taskId 再订阅，不丢首 token。
 */
export function useChatStream({ onFinal, onError }: StreamCallbacks) {
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const taskRef = useRef<string | null>(null)
  const closeRef = useRef<(() => void) | null>(null)

  const cleanup = useCallback(() => {
    closeRef.current?.()
    closeRef.current = null
    taskRef.current = null
    setStreaming(false)
  }, [])

  const send = useCallback(
    async (body: SendMessageBody) => {
      const { taskId } = await sendMessage(body)
      taskRef.current = taskId
      setStreamText('')
      setStreaming(true)
      closeRef.current = subscribeCompletion(taskId, {
        onEvent: (name, data) => {
          if (name === 'token') {
            const delta = (data as { delta?: string })?.delta ?? ''
            setStreamText((t) => t + delta)
          } else if (name === 'done') {
            onFinal(data as DonePayload)
            cleanup()
          } else if (name === 'error') {
            onError((data as { message?: string })?.message ?? '调用失败')
          }
        },
        onError: () => {
          onError('连接中断')
          cleanup()
        },
      })
    },
    [cleanup, onFinal, onError],
  )

  const stop = useCallback(async () => {
    if (taskRef.current) {
      try {
        await stopCompletion(taskRef.current)
      } catch {
        /* 停止失败也无妨，done/error 会收尾 */
      }
    }
  }, [])

  return { streaming, streamText, send, stop }
}
