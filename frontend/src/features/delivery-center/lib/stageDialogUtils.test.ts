import { describe, expect, it } from 'vitest'
import { eventMessage, extractSourceFiles, messageOf, parseTddQuestions } from './stageDialogUtils'

describe('stageDialogUtils', () => {
  it('extracts and de-duplicates source file links', () => {
    const link = '[📎 需求说明](/api/prd-clarify/attachments/file/file-1)'

    expect(extractSourceFiles(link, `${link}\n[验收](/api/prd-clarify/attachments/file/file-2)`)).toEqual([
      { name: '需求说明', url: '/api/prd-clarify/attachments/file/file-1' },
      { name: '验收', url: '/api/prd-clarify/attachments/file/file-2' },
    ])
  })

  it('normalizes string and object TDD questions', () => {
    expect(parseTddQuestions('```json\n["接口如何兼容？", {"question":"数据如何迁移？"}, "接口如何兼容？"]\n```')).toEqual([
      '接口如何兼容？',
      '数据如何迁移？',
    ])
    expect(parseTddQuestions('[CLARIFICATION_COMPLETE]')).toEqual([])
  })

  it('rejects invalid model output instead of silently accepting it', () => {
    expect(() => parseTddQuestions('not-json')).toThrow('AI 未返回有效的问题列表')
    expect(() => parseTddQuestions('[{"answer":"missing question"}]')).toThrow('AI 返回的问题内容为空')
  })

  it('keeps useful transport errors and applies fallbacks', () => {
    expect(eventMessage({ message: '模型不可用' }, '失败')).toBe('模型不可用')
    expect(eventMessage({}, '失败')).toBe('失败')
    expect(messageOf(new Error('网络断开'), '失败')).toBe('网络断开')
    expect(messageOf('unknown', '失败')).toBe('失败')
  })
})
