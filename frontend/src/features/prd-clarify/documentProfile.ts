import type { DocumentProfile } from './types'

export interface DocumentProfileLabels {
  specification: string
  specificationDocument: string
  specificationDraft: string
  specificationClarify: string
  plan: string
  planDocument: string
  planClarify: string
}

const CLASSIC_LABELS: DocumentProfileLabels = {
  specification: 'PRD',
  specificationDocument: 'PRD 文档',
  specificationDraft: 'PRD 草稿',
  specificationClarify: 'PRD 澄清',
  plan: 'TDD',
  planDocument: 'TDD 技术方案',
  planClarify: 'TDD 技术澄清',
}

const SPEC_DRIVEN_LABELS: DocumentProfileLabels = {
  specification: '核心规格',
  specificationDocument: '核心规格文档',
  specificationDraft: '规格草稿',
  specificationClarify: '规格澄清',
  plan: '执行计划',
  planDocument: '执行计划文档',
  planClarify: '执行计划澄清',
}

export function documentProfileLabels(profile?: DocumentProfile | null): DocumentProfileLabels {
  return profile === 'SPEC_DRIVEN' ? SPEC_DRIVEN_LABELS : CLASSIC_LABELS
}
