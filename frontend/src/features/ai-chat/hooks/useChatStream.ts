import { useCallback, useRef, useState } from 'react'
import { sendMessage, stopCompletion, subscribeCompletion } from '../api'
import type { CompletionDebug, DonePayload, SendMessageBody, ToolStep } from '../types'

interface StreamCallbacks {
  /** 收到终止事件（含完整内容）。用于把流式气泡定稿为一条助手消息。 */
  onFinal: (payload: DonePayload) => void
  /** 4sapi 调用出错的提示文案。 */
  onError: (message: string) => void
  /** 调试快照更新（成功用后端 debug，出错/中断/发送失败用前端兜底快照）。 */
  onDebug?: (debug: CompletionDebug) => void
}

/** 出错路径的前端兜底调试快照：用已知的请求参数 + 错误信息，保证异常请求也进调试框。 */
function errorDebug(body: SendMessageBody, message: string): CompletionDebug {
  return {
    requestedAt: Date.now(),
    baseUrl: '(前端未知，详见后端配置)',
    model: body.model ?? '',
    temperatureSent: body.temperature ?? null,
    maxTokens: body.maxTokens ?? null,
    messages: [{ role: 'USER', text: body.content, images: body.attachmentIds?.length ?? 0 }],
    status: 'ERROR',
    responseModel: null,
    finishReason: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    totalTokens: null,
    cachedTokens: null,
    responseChars: 0,
    error: message,
  }
}

/**
 * 封装「发送 → 订阅 SSE token 流 → 停止」。
 * 后端在客户端打开 SSE 后才真正开始流式，故 send 内先 POST 拿 taskId 再订阅，不丢首 token。
 */
export function useChatStream({ onFinal, onError, onDebug }: StreamCallbacks) {
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [toolSteps, setToolSteps] = useState<ToolStep[]>([])
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
      try {
        const { taskId } = await sendMessage(body)
        taskRef.current = taskId
        setStreamText('')
        setToolSteps([])
        setStreaming(true)
        closeRef.current = subscribeCompletion(taskId, {
          onEvent: (name, data) => {
            if (name === 'token') {
              const delta = (data as { delta?: string })?.delta ?? ''
              setStreamText((t) => t + delta)
            } else if (name === 'tool_call') {
              const d = data as { round?: number; name?: string; arguments?: string }
              setToolSteps((steps) => [
                ...steps,
                { round: d.round ?? 0, name: d.name ?? '', arguments: d.arguments ?? '', status: 'running' },
              ])
            } else if (name === 'tool_result') {
              const d = data as { round?: number; name?: string; result?: string }
              // 把最近一个同名且仍 running 的步骤标记为 done 并填结果。
              setToolSteps((steps) => {
                const next = [...steps]
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].name === d.name && next[i].status === 'running') {
                    next[i] = { ...next[i], result: d.result ?? '', status: 'done' }
                    break
                  }
                }
                return next
              })
            } else if (name === 'done') {
              onFinal(data as DonePayload)
              cleanup()
            } else if (name === 'error') {
              const msg = (data as { message?: string })?.message ?? '调用失败'
              onError(msg)
              // 后端随后会发 done（带更全的 debug）覆盖；这里先兜底，确保异常一定进调试框。
              onDebug?.(errorDebug(body, msg))
            }
          },
          onError: () => {
            onError('连接中断')
            onDebug?.(errorDebug(body, '连接中断（SSE 断开，未收到完成事件）'))
            cleanup()
          },
        })
      } catch (e) {
        // POST /completions 本身失败（校验 400、网络等），不会有 SSE/done，单独兜底进调试框。
        const msg = e instanceof Error ? e.message : '发送失败'
        onError(msg)
        onDebug?.(errorDebug(body, msg))
        cleanup()
      }
    },
    [cleanup, onFinal, onError, onDebug],
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

  return { streaming, streamText, toolSteps, send, stop }
}
