import { parseUnits } from './indexer.js'
import { normalize } from './storage.js'
import { requireCondition, type Decision, type Resolution, type Unit } from './contracts.js'

export function validateDecisions(resolution: Resolution, decisions: Decision[], index: { units: Unit[]; capabilities: string[] }) {
  requireCondition(decisions.length === resolution.items.length && new Set(decisions.map(d => d.itemId)).size === decisions.length,
    'SPEC_RESOLUTION_UNCONFIRMED', '每项必须且只能有一个决策')
  const targets = new Set<string>()
  for (const decision of decisions) {
    requireCondition(resolution.items.some(item => item.itemId === decision.itemId), 'SPEC_TARGET_CONFLICT', '未知需求项')
    validateDecision(decision, index)
    if (decision.classification === 'NO_SPEC_CHANGE') continue
    const target = `${decision.capabilityId}:${decision.requirementId || parseUnits(decision.requirement!, decision.capabilityId!, '')[0]?.title}`
    requireCondition(!targets.has(target), 'DELTA_DUPLICATE', '多项指向同一 Requirement；请先合并或明确拆分')
    targets.add(target)
  }
}
function validateDecision(decision: Decision, index: { units: Unit[]; capabilities: string[] }) {
  const { units, capabilities } = index
  const { classification, capabilityId, requirementId } = decision
  const target = units.find(unit => unit.capabilityId === capabilityId && unit.requirementId === requirementId)
  if (classification === 'NO_SPEC_CHANGE') {
    requireCondition(!decision.requirement, 'DELTA_DUPLICATE', 'NO_SPEC_CHANGE 不接受 Delta')
    requireCondition(!requirementId || target, 'SPEC_TARGET_CONFLICT', '修复依据不存在')
    return
  }
  requireCondition(capabilityId, 'SPEC_TARGET_CONFLICT', '缺少 capabilityId')
  const exists = capabilities.includes(capabilityId)
  requireCondition(classification === 'NEW_CAPABILITY' ? !exists : exists, 'SPEC_TARGET_CONFLICT', 'Capability 分类与现有规格不符')
  if (classification === 'MODIFIED' || classification === 'REMOVED') requireCondition(target, 'SPEC_TARGET_CONFLICT', '既有 Requirement 不存在')
  else requireCondition(!requirementId, 'SPEC_TARGET_CONFLICT', '新增项不能覆盖既有 Requirement ID')
  requireCondition(decision.requirement, 'DELTA_MISSING', '提供完整 Requirement 草稿')
  const parsed = parseUnits(decision.requirement, capabilityId, '')
  requireCondition(parsed.length === 1 && normalize(parsed[0].content) === normalize(decision.requirement), 'DELTA_INVALID', '只能提交一个完整 Requirement 区块')
  const draft = parsed[0]
  if (target) requireCondition(draft.title === target.title, 'SPEC_TARGET_CONFLICT', '修改或删除必须保留原 Requirement 标题')
  else requireCondition(!units.some(unit => unit.capabilityId === capabilityId && (unit.title === draft.title || unit.requirementId === draft.requirementId)), 'DELTA_DUPLICATE', '已有同名或同 ID Requirement')
  if (classification === 'REMOVED') requireCondition(/\*\*Reason\*\*:/.test(draft.content) && /\*\*Migration\*\*:/.test(draft.content), 'DELTA_INVALID', '移除需填写 Reason 和 Migration')
  else requireCondition(draft.scenarios.length > 0 && /\b(SHALL|MUST)\b/.test(draft.content), 'DELTA_INVALID', '完整规格需 SHALL/MUST 和 Scenario')
  if (target && classification === 'MODIFIED' && target.explicitId) requireCondition(draft.requirementId === target.requirementId, 'SPEC_TARGET_CONFLICT', '修改必须保留稳定 Requirement ID')
}
export function drafts(decisions: Decision[]) {
  const files = new Map<string, Map<string, string[]>>()
  for (const decision of decisions) {
    if (decision.classification === 'NO_SPEC_CHANGE') continue
    const file = `specs/${decision.capabilityId}/spec.md`
    const section = decision.classification === 'NEW_CAPABILITY' ? 'ADDED' : decision.classification
    const sections = files.get(file) || new Map<string, string[]>()
    sections.set(section, [...(sections.get(section) || []), decision.requirement!.trim()]); files.set(file, sections)
  }
  return [...files].map(([path, sections]) => ({ path, content: [...sections].map(([section, values]) => `## ${section} Requirements\n\n${values.join('\n\n')}`).join('\n\n') + '\n' }))
}
