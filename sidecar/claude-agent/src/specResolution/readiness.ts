import { folders, normalize } from './storage.js'
import { indexSpecs, parseUnits } from './indexer.js'
import { requireCondition, type Resolution } from './contracts.js'

export function checkDeltas(root: string, resolution: Resolution) {
  const own = indexSpecs(root, `openspec/changes/${resolution.changeId}/specs`).units
  const expected = (resolution.decisions || []).filter(decision => decision.classification !== 'NO_SPEC_CHANGE')
  requireCondition(own.length === expected.length, own.length > expected.length ? 'DELTA_DUPLICATE' : 'DELTA_MISSING', 'Delta 数量与已确认项不一致；检查遗漏或范围漂移')
  for (const decision of expected) {
    const draft = parseUnits(decision.requirement!, decision.capabilityId!, '')[0]
    const matches = own.filter(unit => unit.capabilityId === decision.capabilityId && unit.title === draft.title)
    requireCondition(matches.length === 1, matches.length ? 'DELTA_DUPLICATE' : 'DELTA_MISSING', `缺少唯一 Delta：${draft.title}`)
    const section = decision.classification === 'NEW_CAPABILITY' ? 'ADDED' : decision.classification
    requireCondition(matches[0].section === `${section} Requirements` && normalize(matches[0].content) === normalize(draft.content),
      'DELTA_CONTENT_MISMATCH', `Delta 与已确认完整正文不一致：${draft.title}`)
  }
  for (const change of folders(root, 'openspec/changes').filter(name => name !== 'archive' && name !== resolution.changeId)) {
    const other = indexSpecs(root, `openspec/changes/${change}/specs`).units
    const conflict = other.find(unit => own.some(target => target.capabilityId === unit.capabilityId
      && (target.requirementId === unit.requirementId || target.title === unit.title)))
    requireCondition(!conflict, 'SPEC_TARGET_CONFLICT', `并行 change ${change} 涉及同一 Requirement：${conflict?.title}；请先协调`)
  }
}
