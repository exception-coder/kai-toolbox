import { describe, expect, it } from 'vitest'
import { buildCodexAuthHandoff } from './codexAuthHandoff'
import type { ChatItem } from '../types'

describe('buildCodexAuthHandoff', () => {
  it('moves visible conversation while excluding tool internals', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: '实现授权目录切换' },
      { kind: 'tool', id: 't1', toolName: 'secret-tool', input: { token: 'hidden' } },
      { kind: 'assistant', id: 'a1', text: '已经完成目录发现。' },
    ]

    const handoff = buildCodexAuthHandoff(items, 'C:\\Users\\me\\.codex-a', 'C:\\Users\\me\\.codex-b')

    expect(handoff).toContain('用户：实现授权目录切换')
    expect(handoff).toContain('助手：已经完成目录发现。')
    expect(handoff).toContain('目标 Auth：C:\\Users\\me\\.codex-b')
    expect(handoff).not.toContain('secret-tool')
    expect(handoff).not.toContain('hidden')
  })
})
