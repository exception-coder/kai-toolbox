import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../types'
import { buildReviewContextSnapshot, initialReviewSpecification } from './reviewShareContext'

describe('reviewShareContext', () => {
  const items: ChatItem[] = [
    { kind: 'user', id: 'u1', text: '移动端只压缩红框区域' },
    { kind: 'assistant', id: 'a1', text: '已理解为局部布局调整' },
  ]

  it('builds a stable business baseline before the conversation evidence', () => {
    const snapshot = buildReviewContextSnapshot({
      systemName: 'ERP',
      moduleName: '计划评审',
      initialSpecification: '移动端保持对话区高度，只压缩汇总提示。',
      items,
    })

    expect(snapshot).toContain('## 评审对象\n系统：ERP\n模块：计划评审')
    expect(snapshot).toContain('## 当前需求初始规格\n移动端保持对话区高度，只压缩汇总提示。')
    expect(snapshot).toContain('## 近期需求与方案上下文\n业务方：移动端只压缩红框区域')
  })

  it('prefills the initial specification from recent business messages', () => {
    expect(initialReviewSpecification(items, 'fallback')).toBe('- 移动端只压缩红框区域')
  })
})
