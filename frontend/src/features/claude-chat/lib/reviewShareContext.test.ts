import { describe, expect, it } from 'vitest'
import type { ChatItem } from '../types'
import { buildReviewContextSnapshot, extractCoreIndex, initialReviewSpecification, parseReviewContextSnapshot, type ReviewContextBaseline } from './reviewShareContext'

describe('reviewShareContext', () => {
  const items: ChatItem[] = [
    { kind: 'user', id: 'u1', text: '移动端只压缩红框区域' },
    { kind: 'assistant', id: 'a1', text: '已理解为局部布局调整' },
  ]

  it('builds a stable business baseline before the conversation evidence', () => {
    const baseline: ReviewContextBaseline = {
      systemName: 'ERP', projectName: 'yoooni-erp', moduleName: '计划评审', moduleKey: 'review-plan',
      moduleSource: 'KNOWLEDGE', modulePaths: ['modules/review'], initialSpecification: '移动端保持对话区高度，只压缩汇总提示。',
      initialSpecificationSource: '关联规格', coreIndex: 'REQ-REVIEW-001 仅压缩汇总提示',
      coreSpecificationSource: '关联规格 · 核心规格', status: 'READY', warnings: [],
    }
    const snapshot = buildReviewContextSnapshot({
      baseline,
      items,
    })

    expect(snapshot).toContain('## 评审对象\n系统：ERP\n项目：yoooni-erp\n模块：计划评审\n模块索引：review-plan')
    expect(snapshot).toContain('## 当前需求初始规格\n来源：关联规格\n移动端保持对话区高度，只压缩汇总提示。')
    expect(snapshot).toContain('## 核心索引上下文\n来源：关联规格 · 核心规格')
    expect(parseReviewContextSnapshot(snapshot)).toMatchObject({ status: 'READY', legacy: false })
    expect(snapshot).toContain('## 近期需求与方案上下文\n业务方：移动端只压缩红框区域')
  })

  it('extracts headings and stable ids from the core specification', () => {
    expect(extractCoreIndex('# 核心规格\n说明\n- REQ-REVIEW-001 固化上下文\n实现细节'))
      .toBe('# 核心规格\n- REQ-REVIEW-001 固化上下文')
  })

  it('prefills the initial specification from recent business messages', () => {
    expect(initialReviewSpecification(items, 'fallback')).toBe('- 移动端只压缩红框区域')
  })
})
