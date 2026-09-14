const RECOVERY_KEY_PREFIX = 'kai.native-voice-recovery:'

export function hasVoiceRecoveryHint(sessionId: string | null): boolean {
  if (!sessionId) return false
  try { return sessionStorage.getItem(RECOVERY_KEY_PREFIX + sessionId) === '1' }
  catch { return false }
}

export function rememberVoiceRecovery(sessionId: string, recoverable: boolean): void {
  try {
    if (recoverable) sessionStorage.setItem(RECOVERY_KEY_PREFIX + sessionId, '1')
    else sessionStorage.removeItem(RECOVERY_KEY_PREFIX + sessionId)
  } catch {
    // Recovery hints are optional in browsers that disable session storage; media remains usable.
  }
}
