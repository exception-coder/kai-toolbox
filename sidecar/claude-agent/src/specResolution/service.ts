import fs from 'node:fs'
import { checkSchema, confirmSchema, resolveSchema, refreshSchema, requireCondition, type Context, type Resolution } from './contracts.js'
import { hash, locked, normalize, projectContext, readJson, saveJson, statePath, safePath } from './storage.js'
import { indexSpecs } from './indexer.js'
import { graphEvidence, retrieve } from './retriever.js'
import { drafts, validateDecisions } from './decisions.js'
import { checkDeltas } from './readiness.js'

export function resolveSpecs(raw: unknown): Resolution {
  const input = resolveSchema.parse(raw); const { root, branch } = projectContext(input)
  requireCondition(new Set(input.requirements.map(item => item.externalId)).size === input.requirements.length,
    'REQUIREMENTS_NOT_ATOMIC', 'externalId 必须唯一；先拆分为原子项')
  const index = indexSpecs(root)
  const items = input.requirements.map(item => ({ ...item, text: normalize(item.text) }))
  const resolutionId = `sr_${hash(JSON.stringify({ root, branch, change: input.changeId, revision: index.revision, items, files: input.changedFiles })).slice(0, 32)}`
  return locked(root, () => {
    const file = statePath(root, resolutionId)
    if (fs.existsSync(file)) {
      const previous = readJson<Resolution>(file)
      saveJson(statePath(root, `active-${input.changeId}`), { resolutionId })
      return previous
    }
    const graph = graphEvidence(root, items.map(item => item.text).join(' '), input.changedFiles)
    const resolution: Resolution = { schemaVersion: 1, resolutionId, project: root, branch,
      changeId: input.changeId, requestId: input.requestId, specRevision: index.revision, createdAt: new Date().toISOString(),
      items: items.map(item => ({ itemId: item.externalId, text: item.text, candidates: retrieve(index.units, item.text, item.terms, graph.terms) })),
      warnings: [...index.warnings, 'AGENT_REVIEW_REQUIRED: 排序分数不是语义置信度；逐项审阅并确认',
        'GRAPH_FRESHNESS_UNVERIFIED: 图谱关联需对照当前源码；不参与自动批准'],
      graph: { status: graph.status, evidence: graph.evidence }, audit: [] }
    saveJson(file, resolution)
    saveJson(statePath(root, `active-${input.changeId}`), { resolutionId })
    return resolution
  })
}
export function loadActive(root: string, context: Context, branch: string): Resolution {
  const active = statePath(root, `active-${context.changeId}`)
  requireCondition(fs.existsSync(active), 'SPEC_RESOLUTION_MISSING', '先调用 resolve_specs 并完成逐项审阅')
  const pointer = readJson<{ resolutionId: string }>(active)
  requireCondition(/^sr_[a-f0-9]{32}$/.test(pointer.resolutionId), 'SPEC_RESOLUTION_MISSING', '解析指针无效')
  const result = readJson<Resolution>(statePath(root, pointer.resolutionId))
  requireCondition(result.schemaVersion === 1 && result.project === root && result.branch === branch && result.changeId === context.changeId,
    'CHANGE_CONTEXT_MISMATCH', '解析记录不属于当前项目、分支或 change')
  return result
}
export function confirmResolution(raw: unknown) {
  const input = confirmSchema.parse(raw); const { root, branch } = projectContext(input)
  return locked(root, () => {
    const result = loadActive(root, input, branch); const index = indexSpecs(root)
    requireCondition(result.resolutionId === input.resolutionId, 'CHANGE_CONTEXT_MISMATCH', '只能确认当前需求批次')
    requireCondition(result.specRevision === index.revision, 'SPEC_INDEX_STALE', '正式规格已变化；重新解析')
    validateDecisions(result, input.decisions, index)
    if (JSON.stringify(result.decisions) !== JSON.stringify(input.decisions)) {
      result.decisions = input.decisions
      result.audit.push({ actor: input.actor, source: 'AGENT', at: new Date().toISOString(), decisions: input.decisions })
      saveJson(statePath(root, result.resolutionId), result)
    }
    return { resolutionId: result.resolutionId, status: 'CONFIRMED', drafts: drafts(input.decisions),
      message: 'Agent 决策已记录；草稿需写入当前 change 并通过 OpenSpec 严格校验；不代表人工批准或实现验收' }
  })
}
export function checkReadiness(raw: unknown) {
  const input = checkSchema.parse(raw); const { root, branch } = projectContext(input)
  const result = loadActive(root, input, branch); const index = indexSpecs(root)
  requireCondition(result.specRevision === index.revision, 'SPEC_INDEX_STALE', '正式规格已变化；重新解析与确认')
  requireCondition(result.decisions, 'SPEC_RESOLUTION_UNCONFIRMED', '尚未完成逐项决策')
  validateDecisions(result, result.decisions, index)
  checkDeltas(root, result)
  return { allowed: true, code: 'PASS', resolutionId: result.resolutionId, specRevision: index.revision,
    operation: input.operation, actions: [], warnings: ['该检查证明规格映射和 Delta 一致，不替代代码范围审阅、OpenSpec validate 或运行验证'] }
}
export function refreshIndex(raw: unknown) {
  const input = refreshSchema.parse(raw); const root = fs.realpathSync(input.project)
  requireCondition(fs.existsSync(safePath(root, 'openspec/config.yaml')), 'OPENSPEC_MISSING', '项目未启用 OpenSpec')
  const index = indexSpecs(root)
  return { specRevision: index.revision, requirements: index.units.length, warnings: index.warnings,
    message: '已从正式规格重建当前索引；旧解析保留审计，过期记录必须重新解析。' }
}
