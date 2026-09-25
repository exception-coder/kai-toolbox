export interface EmbeddedEngineContext {
  text: string
  cwd: string
  model?: string
  apiBaseUrl?: string
  authToken?: string
  sdkSessionId?: string
  developerInstructions?: string
  signal: AbortSignal
  emit: (event: Record<string, unknown>) => void
  setSdkSessionId: (id: string) => void
  canUseTool: (name: string, input: Record<string, unknown>, options: { signal: AbortSignal }) => Promise<Record<string, unknown>>
}

export function safeEngineError(error: unknown, secret?: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return (secret ? message.split(secret).join('[REDACTED]') : message).slice(0, 2000)
}
