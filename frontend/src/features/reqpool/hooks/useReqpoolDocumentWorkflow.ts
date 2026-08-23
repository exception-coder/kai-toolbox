import type { QueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import type { DeliveryOverview } from '@/features/delivery-center/public-api'
import {
  getSession as getPrdSession,
  saveQaHistory,
  startClarify as runPrdClarify,
  startClarifyFromDraft,
  startGenerate as runPrdGenerate,
  startGenerateDevDoc,
  type AgentEngine,
  type PrdSessionView,
  type QaPair,
} from '@/features/prd-clarify/public-api'
import { syncFromPrd } from '../api'
import type { ReqItemView } from '../types'
import type { ReqpoolActions } from './useReqpoolActions'

const GENERATION_POLL_INTERVAL_MS = 2_000
const GENERATION_TIMEOUT_MS = 5 * 60_000

/** 编排需求中枢中的 PRD/TDD 异步工作流，页面只消费稳定业务动作与运行状态。 */
export function useReqpoolDocumentWorkflow({
  queryClient,
  sessionsById,
  actions,
}: {
  queryClient: QueryClient
  sessionsById: Map<string, PrdSessionView>
  actions: ReqpoolActions
}) {
  const {
    showNotice,
    setClarifyingPrdIds,
    setGeneratingPrdIds,
    setGeneratingTddIds,
    setFailedTddIds,
    setQuestionPrd,
  } = actions

  async function startPrdClarification(item: ReqItemView, engine: AgentEngine): Promise<void> {
    const prdSessionId = item.prdSessionId
    if (!prdSessionId) throw new Error('当前需求尚未关联 PRD 草稿')
    const original = await getPrdSession(prdSessionId)
    if (original.status !== 'DRAFT') throw new Error('只有 PRD 草稿可以开始澄清，请刷新后重试')
    if (!original.rawInput?.trim()) throw new Error('PRD 草稿缺少需求描述，请先在 PRD 工作台补充')

    setClarifyingPrdIds(current => new Set(current).add(prdSessionId))
    try {
      const started = await startClarifyFromDraft(prdSessionId, {
        title: original.title,
        rawInput: original.rawInput,
        project: original.project ?? undefined,
        module: original.module ?? undefined,
        engine,
        role: original.role ?? 'PRODUCT',
        reqType: item.reqType === 'UNKNOWN' ? undefined : item.reqType,
        maxQuestions: item.reqType === 'UNKNOWN' ? undefined : original.maxQuestions > 0 ? original.maxQuestions : undefined,
        clarifyMode: 'batch',
        businessFields: original.businessFields,
      })
      queryClient.setQueryData(['prd-session', prdSessionId], started)
      queryClient.setQueryData<PrdSessionView[]>(['prd-sessions', 'reqpool'], current => current?.map(session => session.id === prdSessionId ? started : session))
      queryClient.setQueryData<ReqItemView[]>(['reqpool'], current => current?.map(value => value.id === item.id ? { ...value, status: 'CLARIFYING', updatedAt: Date.now() } : value))

      let finished = false
      const finish = (notice?: string) => {
        if (finished) return
        finished = true
        removeFromSet(setClarifyingPrdIds, prdSessionId)
        refreshDocumentQueries(queryClient, prdSessionId)
        void syncFromPrd().finally(() => queryClient.invalidateQueries({ queryKey: ['reqpool'] }))
        if (notice) showNotice(notice)
      }

      runPrdClarify(prdSessionId, {
        onEvent(name) {
          if (name === 'done') finish('AI 已返回待澄清问题，点击紫色 PRD 节点即可回答')
          if (name === 'error') finish('PRD 澄清执行失败，请进入 PRD 工作台重试')
        },
        onError() { finish('PRD 澄清连接失败，请进入 PRD 工作台重试') },
        onClose() { finish() },
      }, engine)
    } catch (cause) {
      removeFromSet(setClarifyingPrdIds, prdSessionId)
      throw cause
    }
  }

  async function submitPrdAnswers(
    item: ReqItemView,
    session: PrdSessionView,
    history: QaPair[],
    extraInstructions?: string,
  ): Promise<void> {
    const prdSessionId = item.prdSessionId
    if (!prdSessionId) throw new Error('当前需求尚未关联 PRD')
    const saved = await saveQaHistory(prdSessionId, history)
    setQuestionPrd(null)
    setGeneratingPrdIds(current => new Set(current).add(prdSessionId))

    const generatingSession = { ...saved, status: 'GENERATING' as const }
    queryClient.setQueryData(['prd-session', prdSessionId], generatingSession)
    queryClient.setQueryData<PrdSessionView[]>(['prd-sessions', 'reqpool'], current => current?.map(value => value.id === prdSessionId ? generatingSession : value))

    let finished = false
    const finish = (notice: string) => {
      if (finished) return
      finished = true
      removeFromSet(setGeneratingPrdIds, prdSessionId)
      refreshDocumentQueries(queryClient, prdSessionId)
      void syncFromPrd().finally(() => queryClient.invalidateQueries({ queryKey: ['reqpool'] }))
      showNotice(notice)
    }

    runPrdGenerate(prdSessionId, {
      onEvent(name) {
        if (name === 'done') finish('PRD 已生成，点击绿色 PRD 节点即可预览')
        if (name === 'error') finish('PRD 生成失败，请稍后重试')
      },
      onError() { finish('PRD 生成连接失败，请稍后重试') },
      onClose() {
        if (!finished) void getPrdSession(prdSessionId).then(latest => {
          if (latest.status === 'DONE') finish('PRD 已生成，点击绿色 PRD 节点即可预览')
        })
      },
    }, extraInstructions, false, session.engine ?? 'codex')
  }

  function startTddWork(sessionId: string, engine: AgentEngine): void {
    startTddGeneration(sessionId, [], engine)
  }

  function startTddGeneration(
    sessionId: string,
    history: QaPair[],
    engine: AgentEngine,
    extraInstructions?: string,
  ): void {
    const baselineGeneratedAt = sessionsById.get(sessionId)?.devDocGeneratedAt ?? 0
    setGeneratingTddIds(current => new Set(current).add(sessionId))
    removeFromSet(setFailedTddIds, sessionId)

    let finished = false
    let monitoring = false
    const finish = (success: boolean, notice: string) => {
      if (finished) return
      finished = true
      if (success) markTddComplete(queryClient, sessionId)
      removeFromSet(setGeneratingTddIds, sessionId)
      setFailedTddIds(current => {
        const next = new Set(current)
        if (success) next.delete(sessionId); else next.add(sessionId)
        return next
      })
      refreshDocumentQueries(queryClient, sessionId)
      showNotice(notice)
    }

    const monitorBackgroundResult = () => {
      if (finished || monitoring) return
      monitoring = true
      const deadline = Date.now() + GENERATION_TIMEOUT_MS
      const poll = () => {
        if (finished) return
        void getPrdSession(sessionId).then(latest => {
          if ((latest.devDocGeneratedAt ?? 0) > baselineGeneratedAt) finish(true, 'TDD 已生成，点击绿色 TDD 节点即可预览')
          else if (Date.now() >= deadline) finish(false, 'TDD 后台生成超时，请点击红色节点重试；已提交答案会自动恢复')
          else window.setTimeout(poll, GENERATION_POLL_INTERVAL_MS)
        }).catch(() => {
          if (Date.now() >= deadline) finish(false, '暂时无法确认 TDD 生成结果，请稍后重试')
          else window.setTimeout(poll, GENERATION_POLL_INTERVAL_MS)
        })
      }
      poll()
    }

    startGenerateDevDoc(sessionId, extraInstructions, false, history, true, {
      onEvent(name, data) {
        if (name === 'done') finish(true, 'TDD 已生成，点击绿色 TDD 节点即可预览')
        if (name === 'error') {
          const message = typeof data === 'object' && data && 'message' in data && typeof data.message === 'string'
            ? data.message
            : 'TDD 生成失败，请重新作业'
          finish(false, message)
        }
      },
      onError() { monitorBackgroundResult() },
      onClose() { if (!finished) monitorBackgroundResult() },
    }, engine, true)
  }

  return { startPrdClarification, submitPrdAnswers, startTddWork, startTddGeneration }
}

function removeFromSet(
  setter: Dispatch<SetStateAction<Set<string>>>,
  value: string,
): void {
  setter(current => {
    if (!current.has(value)) return current
    const next = new Set(current)
    next.delete(value)
    return next
  })
}

function refreshDocumentQueries(queryClient: QueryClient, sessionId: string): void {
  void queryClient.invalidateQueries({ queryKey: ['prd-session', sessionId] })
  void queryClient.invalidateQueries({ queryKey: ['prd-sessions', 'reqpool'] })
  void queryClient.invalidateQueries({ queryKey: ['delivery-overview'] })
}

function markTddComplete(queryClient: QueryClient, sessionId: string): void {
  queryClient.setQueriesData<DeliveryOverview>({ queryKey: ['delivery-overview'] }, current => {
    if (!current) return current
    return {
      ...current,
      requirements: current.requirements.map(requirement => requirement.id === sessionId
        ? {
            ...requirement,
            stages: {
              ...requirement.stages,
              tddClarify: { ...requirement.stages.tddClarify, status: 'COMPLETE', score: 100, note: '编码前关键技术决策已由开发者确认' },
              tdd: { ...requirement.stages.tdd, status: 'COMPLETE', score: 100, updatedAt: Date.now(), note: 'TDD 已生成' },
            },
          }
        : requirement),
    }
  })
}
