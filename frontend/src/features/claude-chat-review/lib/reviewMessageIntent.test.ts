import { describe, expect, it } from 'vitest'
import type { ChatItem } from '@/features/claude-chat/public-api'
import {
  INTERNAL_SUMMARY_PREFIX,
  parseReviewIntent,
  projectReviewTurns,
  requirementsFromTurns,
} from './reviewMessageIntent'

function completedTurn(user: string, assistant: string): ChatItem[] {
  return [
    { kind: 'user', id: 'u1', text: user, ts: 10 },
    { kind: 'assistant', id: 'a1', text: assistant, ts: 11 },
    { kind: 'result', id: 'r1', stopReason: 'end_turn', ts: 12 },
  ]
}

describe('评审消息分类', () => {
  it('问候属于沟通咨询且不进入需求汇总', () => {
    const turns = projectReviewTurns(completedTurn('你好', '你好，请问想评审什么？\n<!-- forge-review-intent:CONSULTATION -->'), 0, true)
    expect(turns[0].intent).toBe('CONSULTATION')
    expect(requirementsFromTurns(turns, 0)).toHaveLength(0)
  })

  it('需求反馈保留用户原文和 AI 业务分析并隐藏协议标记', () => {
    const turns = projectReviewTurns(completedTurn('审批要支持驳回', '已识别审批例外场景。\n<!-- forge-review-intent:REQUIREMENT -->'), 0, true)
    const requirements = requirementsFromTurns(turns, 0)
    expect(turns[0].intent).toBe('REQUIREMENT')
    expect(turns[0].assistantText).toBe('已识别审批例外场景。')
    expect(requirements[0].text).toContain('审批要支持驳回')
    expect(requirements[0].text).not.toContain('forge-review-intent')
    expect(requirements[0].title).toBe('审批要支持驳回')
  })

  it('缺失或非法标记安全降级为待确认需求，避免业务诉求丢失', () => {
    expect(parseReviewIntent('普通回答').intent).toBe('UNCLASSIFIED')
    expect(parseReviewIntent('回答\n<!-- forge-review-intent:MAYBE -->').intent).toBe('UNCLASSIFIED')
    const turns = projectReviewTurns(completedTurn('一个问题', '普通回答'), 0, true)
    expect(turns[0].intent).toBe('UNCLASSIFIED')
    expect(requirementsFromTurns(turns, 0)[0].content).toContain('待确认需求')
  })

  it('优先采用 Forge 结构化分类，不依赖回复末尾 marker', () => {
    const items = completedTurn('计划评审不要显示工具调用', `### 需求标题：隐藏工具调用

### 需求说明
业务评审页面只展示业务对话。

### 待确认项
无。

### 验收场景
评审员看不到技术执行轨迹。`)
    const user = items[0]
    if (user.kind === 'user') {
      user.reviewIntent = {
        intent: 'REQUIREMENT',
        sourceMessageId: 'client-message-1',
        classificationStatus: 'CONFIRMED',
        confidence: 0.98,
        reason: '用户明确要求页面展示发生变化',
        signals: ['不要显示'],
        extractedTitle: '隐藏工具调用',
        extractedContent: items[1].kind === 'assistant' ? items[1].text : null,
      }
    }

    const turns = projectReviewTurns(items, 0, true)
    expect(turns[0].intent).toBe('REQUIREMENT')
    expect(requirementsFromTurns(turns, 0)[0].title).toBe('隐藏工具调用')
  })

  it('同一用户轮次的 AI 回复变化不产生重复需求', () => {
    const first = completedTurn('隐藏工具调用', '初版业务分析')
    const second = completedTurn('隐藏工具调用', '补充后的业务分析')
    for (const items of [first, second]) {
      const user = items[0]
      if (user.kind === 'user') user.reviewIntent = {
        sourceMessageId: 'client-message-stable',
        intent: 'REQUIREMENT', classificationStatus: 'CONFIRMED', confidence: 0.98,
        reason: '明确要求页面变化', signals: ['隐藏'],
      }
    }

    const firstId = requirementsFromTurns(projectReviewTurns(first, 0, true), 0)[0].sourceMessageId
    const secondId = requirementsFromTurns(projectReviewTurns(second, 0, true), 0)[0].sourceMessageId
    expect(firstId).toBe(secondId)
  })

  it('区分业务语义待确认与分类协议失败', () => {
    const semanticUnknown = completedTurn('这个再看看', '需要确认具体对象。')
    const protocolMissing = completedTurn('附件里有个问题', '我先看看。')
    for (const [items, status] of [[semanticUnknown, 'CONFIRMED'], [protocolMissing, 'MISSING']] as const) {
      const user = items[0]
      if (user.kind === 'user') user.reviewIntent = {
        intent: 'UNKNOWN', classificationStatus: status, confidence: status === 'CONFIRMED' ? 0.88 : 0,
        reason: status === 'CONFIRMED' ? '业务指代不明' : '分类服务暂不可用', signals: [],
      }
    }

    const semanticTurns = projectReviewTurns(semanticUnknown, 0, true)
    const missingTurns = projectReviewTurns(protocolMissing, 0, true)
    expect(semanticTurns[0].intent).toBe('UNCLASSIFIED')
    expect(requirementsFromTurns(semanticTurns, 0)).toHaveLength(1)
    expect(missingTurns[0].intent).toBe('PENDING')
    expect(requirementsFromTurns(missingTurns, 0)).toHaveLength(0)
  })

  it('从结构化业务回复提取清单标题并避免正文重复标题', () => {
    const turns = projectReviewTurns(completedTurn('审批流程需要支持驳回', `### 需求标题：审批驳回

## 需求说明
审批人可以驳回申请。

## 待确认项
驳回后是否允许重新提交。

## 验收场景
申请人可以看到驳回原因。
<!-- forge-review-intent:REQUIREMENT -->`), 0, true)
    const requirement = requirementsFromTurns(turns, 0)[0]
    expect(requirement.title).toBe('审批驳回')
    expect(requirement.content).toContain('## 需求说明')
    expect(requirement.content).not.toContain('需求标题')
  })

  it('未完成回复显示判断中，内部汇总轮次不参与分类', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'pending', text: '继续补充', ts: 10 },
      { kind: 'assistant', id: 'streaming', text: '正在分析', ts: 11 },
    ]
    expect(projectReviewTurns(items, 0, true)[0].intent).toBe('PENDING')
    expect(projectReviewTurns(completedTurn(`${INTERNAL_SUMMARY_PREFIX}\n汇总`, '汇总结果'), 0, true)).toHaveLength(0)
  })
})
