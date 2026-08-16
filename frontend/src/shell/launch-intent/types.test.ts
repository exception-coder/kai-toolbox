import { describe, expect, it } from 'vitest'
import { parseLaunchIntent } from './types'

const base = {
  id: 'intent-1',
  protocolVersion: 1,
  state: 'PENDING',
  createdAt: 1,
  expiresAt: 2,
  lastError: null,
}

describe('parseLaunchIntent', () => {
  it('parses every supported payload kind', () => {
    expect(parseLaunchIntent({ ...base, type: 'CHAT_OPEN_DRAFT', payload: { cwd: 'x', seed: 'draft' } }).payload.type)
      .toBe('CHAT_OPEN_DRAFT')
    expect(parseLaunchIntent({
      ...base,
      type: 'CHAT_OPEN_AND_SEND',
      payload: { cwd: 'x', seed: 'go', engine: 'codex' },
    }).payload.type).toBe('CHAT_OPEN_AND_SEND')
    expect(parseLaunchIntent({ ...base, type: 'CHAT_OPEN_PANEL', payload: { panel: 'clone' } }).payload.type)
      .toBe('CHAT_OPEN_PANEL')
    expect(parseLaunchIntent({
      ...base,
      type: 'CHAT_OPEN_AND_SEND',
      payload: { cwd: 'x', seed: 'migrate', engine: 'antigravity' },
    }).payload).toMatchObject({ engine: 'antigravity' })
  })

  it('rejects unknown versions and malformed payloads', () => {
    expect(() => parseLaunchIntent({ ...base, protocolVersion: 2, type: 'CHAT_OPEN_PANEL', payload: {} }))
      .toThrow('协议版本')
    expect(() => parseLaunchIntent({ ...base, type: 'CHAT_OPEN_AND_SEND', payload: { cwd: '', seed: '' } }))
      .toThrow()
    expect(() => parseLaunchIntent({
      ...base,
      type: 'CHAT_OPEN_AND_SEND',
      payload: { cwd: 'x', seed: 'go', engine: 'gemini' },
    })).toThrow('未知启动引擎')
  })
})
