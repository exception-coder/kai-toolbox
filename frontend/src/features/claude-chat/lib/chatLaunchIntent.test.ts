import { describe, expect, it } from 'vitest'
import { isChatLaunchTargetReady, planChatLaunch } from './chatLaunchIntent'

describe('planChatLaunch', () => {
  it('defers draft acknowledgement until the new session exists', () => {
    expect(planChatLaunch({ type: 'CHAT_OPEN_DRAFT', cwd: ' D:/repo ', seed: '需求' }, 'old')).toEqual({
      kind: 'OPEN_DRAFT', cwd: 'D:/repo', seed: '需求', previousSessionId: 'old',
    })
  })

  it('preserves engine, PRD linkage and normalized Codex home', () => {
    expect(planChatLaunch({
      type: 'CHAT_OPEN_AND_SEND', cwd: 'D:/repo', seed: '开始', engine: 'codex',
      codexHome: ' C:/codex ', prdSessionId: 'prd-1',
    }, null)).toMatchObject({
      kind: 'OPEN_AND_SEND', engine: 'codex', codexHome: 'C:/codex', prdSessionId: 'prd-1',
    })
  })

  it('maps panel intents without opening a session', () => {
    expect(planChatLaunch({ type: 'CHAT_OPEN_PANEL', panel: 'plugins' }, 'current')).toEqual({
      kind: 'OPEN_PANEL', panel: 'plugins',
    })
  })

  it('waits for a different authoritative session id before dispatching the seed', () => {
    expect(isChatLaunchTargetReady('review-session', 'review-session')).toBe(false)
    expect(isChatLaunchTargetReady('review-session', null)).toBe(false)
    expect(isChatLaunchTargetReady('review-session', 'development-session')).toBe(true)
    expect(isChatLaunchTargetReady(null, 'development-session')).toBe(true)
  })
})
