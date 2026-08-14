import { describe, expect, it } from 'vitest'

import type { ChatItem } from '@/features/claude-chat/public-api'
import { buildConsultTurnAudits } from './consultAudit'

function audit(items: ChatItem[], running = false) {
  const result = buildConsultTurnAudits(items, running).get('assistant-1')
  expect(result).toBeDefined()
  return result!
}

describe('buildConsultTurnAudits', () => {
  it('recognizes domain, Graphify and declared test database evidence', () => {
    const result = audit([
      { kind: 'user', id: 'user-1', text: '这张截图来自测试环境，请查询订单号 1001' },
      { kind: 'tool', id: 'tool-1', toolName: 'mcp__domain-knowledge__query', input: { module: 'order' } },
      { kind: 'tool', id: 'tool-2', toolName: 'shell_command', input: { command: 'graphify query "order state"' } },
      { kind: 'tool', id: 'tool-3', toolName: 'erp_db_query', input: { sql: 'SELECT 1' }, output: '1' },
      { kind: 'assistant', id: 'assistant-1', text: '已完成分析。' },
    ])

    expect(result.domain.state).toBe('pass')
    expect(result.graphify.state).toBe('pass')
    expect(result.database).toMatchObject({
      state: 'pass',
      label: '测试库查询 · 已声明来源',
    })
  })

  it('warns when a record clue is queried without a test environment declaration', () => {
    const result = audit([
      { kind: 'user', id: 'user-1', text: '帮我查询这个订单号 1001' },
      { kind: 'tool', id: 'tool-1', toolName: 'srm_db_query', input: { sql: 'SELECT 1' }, output: '1' },
      { kind: 'assistant', id: 'assistant-1', text: '查询完成。' },
    ])

    expect(result.database).toMatchObject({
      state: 'warn',
      label: '疑似违反测试库红线',
    })
  })

  it('distinguishes valid and malformed bug markers', () => {
    const valid = audit([
      { kind: 'user', id: 'user-1', text: '这是缺陷吗？' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        text: '<<<BUG_REPORT>>>{"title":"状态未刷新"}<<<END_BUG_REPORT>>>',
      },
    ])
    const malformed = audit([
      { kind: 'user', id: 'user-1', text: '这是缺陷吗？' },
      {
        kind: 'assistant',
        id: 'assistant-1',
        text: '<<<BUG_REPORT>>>{"title":}<<<END_BUG_REPORT>>>',
      },
    ])

    expect(valid.bug).toEqual({ state: 'warn', label: '确认缺陷' })
    expect(malformed.bug).toEqual({ state: 'warn', label: 'BUG 标记格式错误' })
  })

  it('keeps the unfinished assistant turn in a running audit state', () => {
    const result = audit([
      { kind: 'user', id: 'user-1', text: '继续分析' },
      { kind: 'assistant', id: 'assistant-1', text: '正在分析中' },
    ], true)

    expect(result.domain.state).toBe('running')
    expect(result.graphify.state).toBe('running')
    expect(result.bug.state).toBe('running')
  })
})
