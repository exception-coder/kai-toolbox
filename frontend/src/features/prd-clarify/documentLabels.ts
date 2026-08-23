export interface DocumentLabels {
  specification: string
  specificationDocument: string
  specificationDraft: string
  specificationClarify: string
  plan: string
  planDocument: string
  planClarify: string
}

export const documentLabels: DocumentLabels = {
  specification: '核心规格',
  specificationDocument: '核心规格文档',
  specificationDraft: '规格草稿',
  specificationClarify: '规格澄清',
  plan: '执行计划',
  planDocument: '执行计划文档',
  planClarify: '执行计划生成',
}
