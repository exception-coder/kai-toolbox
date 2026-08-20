import { describe, expect, it } from 'vitest'
import { requirementListText, requirementSubmissionId, requirementText } from './reviewRequirementSubmission'

describe('评审需求清单提交', () => {
  it('按当前顺序确定性排版完整清单', () => {
    const text = requirementListText([
      { title: '支持驳回', content: '## 需求说明\n审批人可以驳回。' },
      { title: '补充提醒', content: '## 验收场景\n到期前提醒。' },
    ])
    expect(text).toContain('## 1. 支持驳回\n\n## 需求说明')
    expect(text).toContain('## 2. 补充提醒\n\n## 验收场景')
  })

  it('标题或内容修改后产生新的提交指纹', () => {
    const first = requirementSubmissionId({ title: '原标题', content: '原说明' })
    const edited = requirementSubmissionId({ title: '新标题', content: '原说明' })
    expect(first).not.toBe(edited)
    expect(requirementText(' 原标题 ', ' 原说明 ')).toBe('## 原标题\n\n原说明')
  })

  it('删除全部条目后仍生成可交接的空清单快照', () => {
    expect(requirementListText([])).toContain('当前没有保留的有效需求')
  })
})
