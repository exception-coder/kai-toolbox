/** Silence is diagnostic evidence, never a turn deadline or a reason to interrupt. */
export class CodexResponseWatchdog {
  private lastActivityAt = 0
  private waiting = false
  private terminal = false
  private reported = false
  private tools = new Set<string>()

  start(now = Date.now()): void {
    this.lastActivityAt = now
    this.waiting = this.terminal = this.reported = false
    this.tools.clear()
  }

  observe(event: Record<string, unknown>, now = Date.now()): void {
    if (event.watchdogGenerated || event.type === 'turnActivity') return
    if (event.type === 'result') { this.terminal = true; return }
    if (!['assistantDelta', 'toolUse', 'toolResult', 'toolActivity', 'codexActivity',
      'turnProgress', 'permissionRequest', 'questionRequest'].includes(String(event.type))) return
    this.lastActivityAt = now
    this.reported = false
    this.waiting = event.type === 'permissionRequest' || event.type === 'questionRequest'
    const id = typeof event.toolCallId === 'string' ? event.toolCallId : ''
    if (event.type === 'toolUse' && id) this.tools.add(id)
    if (event.type === 'toolResult' && id) this.tools.delete(id)
  }

  check(now = Date.now()): { idleMs: number } | undefined {
    if (this.terminal || this.waiting || this.tools.size || this.reported) return
    const idleMs = now - this.lastActivityAt
    if (idleMs < 2 * 60_000) return
    this.reported = true
    return { idleMs }
  }
}
