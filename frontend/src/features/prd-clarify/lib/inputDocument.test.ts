import { describe, expect, it } from 'vitest'
import { buildFinalRawInput } from './inputDocument'

describe('buildFinalRawInput', () => {
  it('trims plain input without attachments', () => {
    expect(buildFinalRawInput('  需求正文  ', [])).toBe('需求正文')
  })

  it('keeps the original file link and truncated marker', () => {
    const content = buildFinalRawInput('需求正文', [{
      fileName: '需求说明.pdf',
      url: '/api/files/1',
      text: '解析内容',
      truncated: true,
    }])

    expect(content).toContain('[📎 附件：需求说明.pdf](/api/files/1)')
    expect(content).toContain('【附件：需求说明.pdf】\n解析内容')
    expect(content).toContain('（内容已截断）')
  })
})
