import { describe, expect, it } from 'vitest'
import { shouldReconnectSocket } from './socketReconnectPolicy'

describe('shouldReconnectSocket', () => {
  it('reconnects a first open attempt before the server assigns a session id', () => {
    expect(shouldReconnectSocket({
      demo: false,
      hasSessionId: false,
      hasPendingIntent: true,
    })).toBe(true)
  })

  it('does not reconnect a disposable demo or an idle socket without context', () => {
    expect(shouldReconnectSocket({ demo: true, hasSessionId: true, hasPendingIntent: true })).toBe(false)
    expect(shouldReconnectSocket({ demo: false, hasSessionId: false, hasPendingIntent: false })).toBe(false)
  })
})
