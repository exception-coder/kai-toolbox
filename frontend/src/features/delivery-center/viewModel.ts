import type { DeliveryFinding, DeliveryRequirement, StageView } from './types'

export interface ProjectView {
  name: string
  progress: number
  requirementCount: number
  highRiskCount: number
  updatedAt: number
}

export interface ModuleView {
  name: string
  progress: number
  requirementCount: number
  highRiskCount: number
  requirements: DeliveryRequirement[]
}

export function requirementProgress(requirement: DeliveryRequirement) {
  // 需求与技术方案只是前置证据，不代表功能已经交付。固定权重、不对已知阶段重新归一化：
  // PRD 10% + TDD 10% + 本地代码核查 80%。没有代码评估时最高只能到 20%，避免文档齐全即 100%。
  const weightedStages: Array<[StageView, number]> = [
    [requirement.stages.prd, 0.1],
    [requirement.stages.tdd, 0.1],
    [requirement.stages.code, 0.8],
  ]
  return Math.round(weightedStages.reduce(
    (sum, [stage, weight]) => sum + (stage.score ?? 0) * weight,
    0,
  ))
}

export function buildProjects(
  requirements: DeliveryRequirement[],
  findings: DeliveryFinding[],
): ProjectView[] {
  return [...new Set(requirements.map(item => item.project))].map(name => {
    const items = requirements.filter(item => item.project === name)
    return {
      name,
      progress: averageProgress(items),
      requirementCount: items.length,
      highRiskCount: countHighRisk(items, findings),
      updatedAt: Math.max(...items.map(item => item.updatedAt)),
    }
  }).sort((left, right) => right.updatedAt - left.updatedAt)
}

export function buildModules(
  requirements: DeliveryRequirement[],
  findings: DeliveryFinding[],
): ModuleView[] {
  return [...new Set(requirements.map(item => item.module || '未归类'))].map(name => {
    const items = requirements
      .filter(item => (item.module || '未归类') === name)
      .sort((left, right) => left.healthScore - right.healthScore || right.updatedAt - left.updatedAt)
    return {
      name,
      progress: averageProgress(items),
      requirementCount: items.length,
      highRiskCount: countHighRisk(items, findings),
      requirements: items,
    }
  }).sort((left, right) => left.progress - right.progress)
}

export function findingsForRequirement(findings: DeliveryFinding[], requirementId: string) {
  return findings.filter(item => item.requirementId === requirementId)
}

function averageProgress(requirements: DeliveryRequirement[]) {
  const values = requirements
    .map(requirementProgress)
    .filter((value): value is number => value != null)
  if (values.length === 0) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function countHighRisk(requirements: DeliveryRequirement[], findings: DeliveryFinding[]) {
  const ids = new Set(requirements.map(item => item.id))
  return findings.filter(item => item.severity === 'HIGH' && ids.has(item.requirementId)).length
}
