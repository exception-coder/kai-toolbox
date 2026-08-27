import { describe, expect, it } from 'vitest'
import { analysisErrorMessage } from './analysisError'

describe('analysisErrorMessage', () => {
  it('turns quota errors into a recoverable engine prompt without leaking diagnostics', () => {
    const message = analysisErrorMessage(
      new Error('API Error: 403 用户额度不足, 剩余额度: ¥-1.56 (request id: secret)'),
      'claude',
    )

    expect(message).toBe('Claude Code 额度不足，原分析结果未变更。请选择另一个引擎后重试。')
    expect(message).not.toContain('request id')
    expect(message).not.toContain('-1.56')
  })

  it('names the selected engine for generic failures', () => {
    expect(analysisErrorMessage(new Error('connection reset'), 'codex'))
      .toContain('Codex 分析失败')
  })
})
