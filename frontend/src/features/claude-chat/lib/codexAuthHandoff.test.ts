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

    const handoff = buildCodexAuthHandoff({
      items,
      sourceHome: 'C:\\Users\\me\\.codex-a',
      targetHome: 'C:\\Users\\me\\.codex-b',
      cwd: 'D:\\work\\demo',
    })

    expect(handoff).toContain('用户：实现授权目录切换')
    expect(handoff).toContain('助手：已经完成目录发现。')
    expect(handoff).toContain('C:\\\\Users\\\\me\\\\.codex-b')
    expect(handoff).toContain('forge.codex-auth-handoff/v1')
    expect(handoff).toContain('OPEN_SPEC_FIRST')
    expect(handoff).not.toContain('secret-tool')
    expect(handoff).not.toContain('"token": "hidden"')
  })

  it('records referenced specifications without claiming they were verified', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: '继续 openspec/changes/add-orders/tasks.md 的 2.1' },
    ]
    const handoff = buildCodexAuthHandoff({ items, targetHome: 'C:\\Users\\me\\.codex-b' })
    expect(handoff).toContain('openspec/changes/add-orders/tasks.md')
    expect(handoff).toContain('PARTIAL_UNVERIFIED')
    expect(handoff).toContain('hiddenModelStateTransferred')
  })
})
