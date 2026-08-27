import { describe, expect, it } from 'vitest'
import { buildLaunchIntentRoute } from './api'

describe('buildLaunchIntentRoute', () => {
  it('keeps ordinary launch intents scoped only by intent id', () => {
    expect(buildLaunchIntentRoute('/tools/claude-chat', 'intent / 1', {
      type: 'CHAT_OPEN_PANEL',
      panel: 'sessions',
    })).toBe('/tools/claude-chat?launchIntent=intent+%2F+1')
  })

  it('puts the PRD scope in the first navigation for development handoff', () => {
    expect(buildLaunchIntentRoute('/tools/claude-chat', 'intent-1', {
      type: 'CHAT_OPEN_AND_SEND',
      cwd: 'D:\\work\\project',
      seed: 'start',
      engine: 'codex',
      prdSessionId: 'prd / 1',
    })).toBe('/tools/claude-chat?launchIntent=intent-1&prdSessionId=prd+%2F+1')
  })
})
