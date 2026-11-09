/** Reconcile complete Claude text blocks with deltas already delivered to Forge. */
export class ClaudeMessageText {
  private pendingStreamedText = ''
  private readonly completed = new Set<string>()

  accept(message: Record<string, unknown>): string | undefined {
    if (message.type === 'stream_event') {
      const event = message.event as Record<string, unknown> | undefined
      if (event?.type === 'message_start') this.pendingStreamedText = ''
      const delta = event?.delta as Record<string, unknown> | undefined
      if (event?.type !== 'content_block_delta' || delta?.type !== 'text_delta' || typeof delta.text !== 'string') return
      this.pendingStreamedText += delta.text
      return delta.text || undefined
    }
    if (message.type !== 'assistant') return
    const uuid = typeof message.uuid === 'string' ? message.uuid : undefined
    if (uuid && this.completed.has(uuid)) return
    if (uuid) this.completed.add(uuid)
    const body = message.message as Record<string, unknown> | undefined
    if (!Array.isArray(body?.content)) return
    const text = body.content.flatMap(block => block?.type === 'text' && typeof block.text === 'string' ? [block.text] : []).join('')
    if (!text) return
    if (this.pendingStreamedText.startsWith(text)) {
      this.pendingStreamedText = this.pendingStreamedText.slice(text.length)
      return
    }
    const missing = text.startsWith(this.pendingStreamedText)
      ? text.slice(this.pendingStreamedText.length) : text
    this.pendingStreamedText = ''
    return missing || undefined
  }
}
