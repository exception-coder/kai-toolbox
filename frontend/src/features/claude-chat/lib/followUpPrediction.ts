export interface FollowUpPrediction {
  sessionId: string
  sdkSessionId: string
  sourceTurnId: string
  text: string
}

export function currentFollowUpPrediction(
  prediction: FollowUpPrediction,
  context: { sessionId: string | null; sdkSessionId: string | null; sourceTurnId: string | null; running: boolean; engine: string },
): FollowUpPrediction | null {
  if (context.running || context.engine !== 'codex' || prediction.sessionId !== context.sessionId
    || prediction.sdkSessionId !== context.sdkSessionId || prediction.sourceTurnId !== context.sourceTurnId) return null
  const text = typeof prediction.text === 'string' ? prediction.text.trim() : ''
  return text && text.length <= 1_000 ? { ...prediction, text } : null
}
