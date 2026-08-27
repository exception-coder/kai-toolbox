export function shouldReconnectSocket(input: {
  demo: boolean
  hasSessionId: boolean
  hasPendingIntent: boolean
}): boolean {
  return !input.demo && (input.hasSessionId || input.hasPendingIntent)
}
