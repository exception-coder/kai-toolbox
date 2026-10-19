import type { CodexTransportSelection } from '../codexTransportPolicy.js'

type Context = {
  sessionId?: string
  threadId?: string
  execution: 'appServer' | 'sdkFallback' | 'thirdPartySdk'
  selection?: CodexTransportSelection
}

function transportFields(context: Context) {
  return { sessionId: context.sessionId, threadId: context.threadId, execution: context.execution,
    transport: context.selection?.reason === 'large_context' ? 'https' : 'native_policy',
    estimatedContextBytes: context.selection?.contextBytes }
}

export function logCodexSdkTransport(context: Context, inherited: boolean): void {
  console.info(JSON.stringify({ event: 'codex_sdk_transport', ...transportFields(context),
    inherited }))
}

/** Never log request bodies, credentials, raw stderr or a guessed upstream close code. */
export function logCodexTransportError(context: Context, message: string): void {
  const close = message.match(/(?:close(?:\s+code)?|status(?:\s+code)?)\s*[:=(]?\s*(100[0-9]|101[0-5])\b/i)
  const closeCode = close ? Number(close[1]) : undefined
  const kind = closeCode === 1009 ? 'message_too_large'
    : /websocket|stream disconnected|reconnecting|response\.completed/i.test(message) ? 'stream_disconnected'
    : /tls|certificate/i.test(message) ? 'tls_error'
    : undefined
  if (!kind && closeCode == null) return
  console.warn(JSON.stringify({ event: 'codex_upstream_transport_error', ...transportFields(context),
    kind: kind ?? 'websocket_closed', closeCode: closeCode ?? null,
    closeCodeKnown: closeCode != null }))
}
