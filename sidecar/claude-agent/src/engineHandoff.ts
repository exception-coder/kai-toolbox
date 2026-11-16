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
  let failure = false
  let completed = false
  const runner = create(event => {
    if (event.type === 'assistantDelta') reply += String(event.text ?? '')
    if (event.type === 'assistantSnapshot') reply = String(event.text ?? '')
    if (event.type === 'error' || event.type === 'toolUse' || event.type === 'permissionRequest') failure = true
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
      throw new Error('目标引擎没有确认交接，原会话保持不变；请检查认证、模型与原生历史后重试。')
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
