import { http } from '@/lib/api'

export interface KnowledgeTreeNode {
  id: string
  title: string
  summary: string
  nodeType: string
  level: number
  children: KnowledgeTreeNode[]
}

export interface KnowledgeNode {
  id: string
  title: string
  summary: string
  content: string
  nodeType: string
  level: number
  parentId: string | null
  sortOrder: number
}

export interface KnowledgeExample {
  id: number
  nodeId: string
  title: string
  beforeCode: string
  afterCode: string
  explanation: string
}

export interface KnowledgeInterview {
  id: number
  nodeId: string
  question: string
  shortAnswer: string
  detailAnswer: string
  projectAnswer: string
}

export interface KnowledgeDetail {
  node: KnowledgeNode
  examples: KnowledgeExample[]
  interviews: KnowledgeInterview[]
}

export interface KnowledgeRelation {
  id: number
  relationType: string
  direction: 'OUTGOING' | 'INCOMING'
  node: KnowledgeNode
}

export const loadKnowledgeTree = () => http<KnowledgeTreeNode[]>('/java8/categories')
export const loadKnowledgeDetail = (id: string) => http<KnowledgeDetail>(`/java8/nodes/${encodeURIComponent(id)}`)
export const loadKnowledgeRelations = (id: string) =>
  http<KnowledgeRelation[]>(`/java8/nodes/${encodeURIComponent(id)}/relations`)
