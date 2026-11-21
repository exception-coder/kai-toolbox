/** Only adapters with a deterministic no-business-tools mode can acknowledge a handoff. */
export const HANDOFF_ENGINES = new Set(['claude', 'codex', 'pi', 'copilot'])

export interface HandoffRunner {
  sdkSessionId?: string
  runTurn(text: string): Promise<void>
  interrupt(): unknown
  dispose(): Promise<void>
}

export async function acknowledgeHandoff(
  requestId: string, nativeId: string | undefined, prompt: string,
  create: (emit: (event: Record<string, unknown>) => void) => HandoffRunner,
  timeoutMs = 120_000,
): Promise<string> {
  let reply = ''
  let failure: 'engine_error' | 'tool_attempt' | undefined
  let errorCode: string | undefined
  let completed = false
  const runner = create(event => {
    if (event.type === 'assistantDelta') reply += String(event.text ?? '')
    if (event.type === 'assistantSnapshot') reply = String(event.text ?? '')
    if (event.type === 'error') {
      failure ??= 'engine_error'
      const code = event.code
      if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{0,79}$/.test(code)) errorCode ??= code
    }
    if (event.type === 'toolUse' || event.type === 'permissionRequest') failure = 'tool_attempt'
    if (event.type === 'result') completed = ['end_turn', 'success', 'completed', 'stop'].includes(String(event.stopReason))
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      runner.runTurn(prompt),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          runner.interrupt()
          reject(new Error('目标引擎接管超时，原会话保持不变；请检查引擎后重试。'))
        }, timeoutMs)
      }),
    ])
    if (failure || !completed || reply.trim() !== `FORGE_HANDOFF_ACK:${requestId}`) {
      const reason = failure ?? (completed ? 'ack_mismatch' : 'missing_success')
      console.warn('[engine-handoff] confirmation rejected', { requestId, reason, errorCode })
      if (errorCode === 'HANDOFF_THREAD_ARCHIVED') {
        throw new Error('原 Codex 会话已归档。请先在 Codex 恢复该会话，再重试切换。')
      }
      if (failure === 'tool_attempt') throw new Error('目标引擎尝试调用工具，交接已停止。请重试切换。')
      if (reason === 'ack_mismatch') throw new Error('目标引擎已回复，但返回的交接确认不匹配。请重试切换。')
      throw new Error('目标引擎未完成交接。请先检查目标引擎是否能正常对话，再重试切换。')
    }
    if (!runner.sdkSessionId || nativeId && nativeId !== runner.sdkSessionId) {
      throw new Error('目标原生会话未恢复或身份发生变化，未提交切换。')
    }
    return runner.sdkSessionId
  } finally {
    clearTimeout(timer)
    await runner.dispose()
  }
}
