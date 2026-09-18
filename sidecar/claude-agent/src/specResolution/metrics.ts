import fs from 'node:fs'
import { refreshSchema, type Decision, type Resolution, requireCondition } from './contracts.js'
import { readJson, safePath } from './storage.js'

function target(decision: Decision) { return `${decision.classification}:${decision.capabilityId || ''}:${decision.requirementId || ''}` }
/** Confirmation history supplies labels; missing labels remain unknown, never count as correct. */
export function resolutionMetrics(raw: unknown) {
  const input = refreshSchema.parse(raw); const root = fs.realpathSync(input.project)
  const directory = safePath(root, '.forge/spec-resolution')
  const files = fs.existsSync(directory) ? fs.readdirSync(directory).filter(name => /^sr_[a-f0-9]{32}\.json$/.test(name)) : []
  requireCondition(files.length <= 2000, 'METRICS_LIMIT', '超过 2000 个解析记录；先按项目整理审计样本')
  let labeledExisting = 0; let recalledTop3 = 0; let labeledAuto = 0; let correctAuto = 0
  let automatic = 0; let withEvidence = 0; let autoNew = 0; let corrections = 0
  const durations: number[] = []
  for (const file of files) {
    const result = readJson<Resolution>(safePath(root, `.forge/spec-resolution/${file}`))
    if (result.schemaVersion !== 1 || result.project !== root) continue
    if (result.semantic) durations.push(result.semantic.elapsedMs)
    for (const item of result.items) {
      const confirmed = result.decisions?.find(decision => decision.itemId === item.itemId)
      if (confirmed?.requirementId) {
        labeledExisting++
        if (item.candidates.slice(0, 3).some(candidate => candidate.capabilityId === confirmed.capabilityId && candidate.requirementId === confirmed.requirementId)) recalledTop3++
      }
    }
    for (const rawRecommendation of result.semantic?.recommendations || []) {
      const recommendation = rawRecommendation as { status: string; decision: Decision; evidence: unknown[] }
      const confirmed = result.decisions?.find(decision => decision.itemId === recommendation.decision.itemId)
      if (confirmed && target(confirmed) !== target(recommendation.decision)) corrections++
      if (recommendation.status !== 'AUTO_DRAFT') continue
      automatic++; if (recommendation.evidence.length) withEvidence++
      if (recommendation.decision.classification === 'NEW_CAPABILITY') autoNew++
      if (confirmed) { labeledAuto++; if (target(confirmed) === target(recommendation.decision)) correctAuto++ }
    }
  }
  durations.sort((a, b) => a - b)
  const rate = (numerator: number, denominator: number) => denominator ? numerator / denominator : null
  return { records: files.length, labeledExisting, labeledAuto, automatic, corrections,
    existingTop3Recall: rate(recalledTop3, labeledExisting), automaticMappingAgreement: rate(correctAuto, labeledAuto),
    automaticEvidenceCoverage: rate(withEvidence, automatic), automaticNewCapability: autoNew,
    semanticP95Ms: durations.length ? durations[Math.ceil(durations.length * 0.95) - 1] : null,
    targets: { existingTop3Recall: 0.95, automaticMappingAgreement: 0.98, automaticNewCapability: 0, automaticEvidenceCoverage: 1 },
    warning: '确认记录是 Agent 纠正样本，不是独立人工真值。小样本或空样本不证明达到目标；草稿未创建 Capability，重复创建率需由真实归档结果独立标注。semanticP95Ms 不包含索引与宿主开销。' }
}
