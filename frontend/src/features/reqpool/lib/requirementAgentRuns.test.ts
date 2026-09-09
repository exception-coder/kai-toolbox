import { describe, expect, it } from 'vitest'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import { requirementAgentRuns } from './requirementAgentRuns'

const session = (overrides: Partial<PrdSessionView>): PrdSessionView => ({
  id: 'prd-1', title: '需求', project: 'demo', module: 'order', status: 'DONE', engine: 'codex',
  role: 'PRODUCT', reqType: 'MODULE_ADJUST', maxQuestions: 3, clarifyMode: 'batch', rawInput: '调整',
  businessFields: {}, questions: [], prdQuestionsGeneratedAt: null, prdGeneratedAt: 1,
  initialSpecPath: null, mdPath: 'spec.md', devDocPath: null, devSessionId: null,
  devDocGeneratedAt: null, devDocQuestionsGeneratedAt: null, devDocHistory: [], devDocQaDraft: [],
  devDocWorkStatus: null, devDocWorkError: null, devDocWorkProgress: null, devDocWorkContent: null,
  devDocWorkUpdatedAt: null, devDocEstimation: null, progressPath: null, progressGeneratedAt: null,
  progressWorkStatus: 'IDLE', progressWorkStage: null, progressWorkError: null,
  progressWorkStartedAt: null, progressWorkCompletedAt: null, progressWorkUpdatedAt: null,
  createdByUserId: null, createdByUsername: null, parentId: null, errorMsg: null, createdAt: 1, updatedAt: 1,
  ...overrides,
})

describe('requirementAgentRuns', () => {
  it('keeps the specification agent active while the execution plan is generating', () => {
    const [specification, progress] = requirementAgentRuns(session({ devDocWorkStatus: 'GENERATING', devDocWorkProgress: 'Codex 正在生成执行计划' }))
    expect(specification).toMatchObject({ agentId: 'requirement-specification', status: 'RUNNING', active: true })
    expect(progress).toMatchObject({ agentId: 'requirement-progress', status: 'IDLE' })
  })

  it('restores progress failures with a retry action', () => {
    const [, progress] = requirementAgentRuns(session({ devDocPath: 'plan.md', progressWorkStatus: 'ERROR', progressWorkError: '代码目录不可用' }))
    expect(progress).toMatchObject({ status: 'FAILED', error: '代码目录不可用', active: false })
    expect(progress.nextAction).toContain('重新执行')
  })
})
