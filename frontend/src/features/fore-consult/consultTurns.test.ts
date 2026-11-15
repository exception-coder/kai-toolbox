import { describe, expect, it } from 'vitest'
import { extractTurns } from './consultTurns'
import { parseConsultAnswer } from './consultAnswer'

const recognition = '\n<<<CONSULT_RECOGNITION>>>\n{"recognitionStatus":"PARTIAL","moduleNames":["销售"],"evidence":["RUNTIME_DATA"]}\n<<<END_CONSULT_RECOGNITION>>>'

describe('咨询轮次归档', () => {
  it('税费案例只归档完整答复，保留原始提问时间和识别证据', () => {
    const turns = extractTurns([
      { kind: 'user', id: 'u', text: '什么情况', ts: 1794477428094 },
      { kind: 'assistant', id: 'a1', text: '差额正好是税费，我继续核对。' },
      { kind: 'assistant', id: 'a2', text: '单头金额与明细不一致，尚未修改。' + recognition },
    ], new Map())
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ createdAt: 1794477428094,
      answer: '单头金额与明细不一致，尚未修改。', recognitionStatus: 'PARTIAL',
      recognitionEvidence: ['RUNTIME_DATA'] })
  })

  it('不按关键词删除旧回答，也不把没有最终标记的内容丢掉', () => {
    expect(parseConsultAnswer(['已确认记录。', '我继续查是用户要求，不是处理成功。']).answer)
      .toBe('已确认记录。\n\n我继续查是用户要求，不是处理成功。')
    expect(parseConsultAnswer(['已有依据', '未完成<<<CONSULT_RECOGNITION>>>']).answer)
      .toBe('已有依据\n\n未完成')
  })

  it('使用最后一次完整结论并保留后续纠正，不串入下一轮', () => {
    expect(parseConsultAnswer(['旧结论' + recognition, '修正结论' + recognition, '补充：尚未执行']).answer)
      .toBe('修正结论\n\n补充：尚未执行')
    const turns = extractTurns([
      { kind: 'user', id: 'u1', text: '问题一', ts: 100 },
      { kind: 'assistant', id: 'a1', text: '答案一' + recognition },
      { kind: 'user', id: 'u2', text: '问题二', ts: 200 },
    ], new Map())
    expect(turns.map(t => [t.createdAt, t.answer])).toEqual([[100, '答案一'], [200, '']])
  })
})
