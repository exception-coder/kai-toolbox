import { folders, normalize } from './storage.js'
import { indexSpecs, parseUnits } from './indexer.js'
import { requireCondition, type Resolution } from './contracts.js'

export function checkDeltas(root: string, resolution: Resolution) {
  const own = indexSpecs(root, `openspec/changes/${resolution.changeId}/specs`).units
  const expected = (resolution.decisions || []).filter(decision => decision.classification !== 'NO_SPEC_CHANGE')
  const batch: typeof own = []
  for (const decision of expected) {
    const draft = parseUnits(decision.requirement!, decision.capabilityId!, '')[0]
    const matches = own.filter(unit => unit.capabilityId === decision.capabilityId && unit.title === draft.title)
    requireCondition(matches.length === 1, matches.length ? 'DELTA_DUPLICATE' : 'DELTA_MISSING',
      `${matches.length ? `发现 ${matches.length} 个` : '缺少'}本批唯一 Delta：${decision.capabilityId} / ${draft.title}`)
    const section = decision.classification === 'NEW_CAPABILITY' ? 'ADDED' : decision.classification
    requireCondition(matches[0].section === `${section} Requirements` && normalize(matches[0].content) === normalize(draft.content),
      'DELTA_CONTENT_MISMATCH', `Delta 与已确认完整正文不一致：${draft.title}`)
    batch.push(matches[0])
  }
  for (const change of folders(root, 'openspec/changes').filter(name => name !== 'archive' && name !== resolution.changeId)) {
    const other = indexSpecs(root, `openspec/changes/${change}/specs`).units
    const conflict = other.find(unit => batch.some(target => target.capabilityId === unit.capabilityId
      && (target.requirementId === unit.requirementId || target.title === unit.title)))
    requireCondition(!conflict, 'SPEC_TARGET_CONFLICT', `并行 change ${change} 涉及同一 Requirement：${conflict?.title}；请先协调`)
  }
}
