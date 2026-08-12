import type { KnowledgeTreeNode } from '../api/knowledgeApi'

export type ExperienceLevel = 'graduate' | 'one-year' | 'three-years' | 'five-years' | 'eight-years'
export type TargetRole = 'java-backend' | 'microservice' | 'performance' | 'architecture'

export interface LearningProfile {
  experience: ExperienceLevel
  role: TargetRole
}

export interface ExperienceOption {
  id: ExperienceLevel
  label: string
  seniority: string
  interviewRatio: string
  focus: string
}

export interface RoleOption {
  id: TargetRole
  label: string
  focus: string
}

type CategoryKey =
  | 'java'
  | 'jvm'
  | 'concurrency'
  | 'spring'
  | 'mysql'
  | 'redis'
  | 'message-queue'
  | 'microservice'
  | 'transaction'
  | 'distributed-lock'
  | 'sharding'
  | 'middleware'
  | 'network'
  | 'architecture'
  | 'scenario'
  | 'performance'
  | 'algorithm'
  | 'ai'
  | 'engineering'
  | 'scheduler'
  | 'file-processing'
  | 'experience'
  | 'soft-skills'

export const DEFAULT_LEARNING_PROFILE: LearningProfile = {
  experience: 'three-years',
  role: 'java-backend',
}

export const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    id: 'graduate',
    label: '应届',
    seniority: '入门',
    interviewRatio: '70% 以上',
    focus: 'Java、集合、并发、JVM、Spring、数据库与计算机基础',
  },
  {
    id: 'one-year',
    label: '1 年',
    seniority: '初级',
    interviewRatio: '60% 以上',
    focus: '基础全量，并补齐微服务、分布式、中间件与线上排查',
  },
  {
    id: 'three-years',
    label: '3 年',
    seniority: '中级',
    interviewRatio: '45% 以上',
    focus: '原理、调优、服务治理、分库分表、任务调度与场景题',
  },
  {
    id: 'five-years',
    label: '5 年',
    seniority: '高级',
    interviewRatio: '30% 以上',
    focus: '源码、三高、分布式事务、架构设计与全链路排查',
  },
  {
    id: 'eight-years',
    label: '8 年',
    seniority: '架构',
    interviewRatio: '30% 以上',
    focus: '系统权衡、方案选型、微服务治理、三高与架构设计',
  },
]

export const ROLE_OPTIONS: RoleOption[] = [
  { id: 'java-backend', label: 'Java 后端', focus: '保留当前年限的通用 Java 后端清单' },
  { id: 'microservice', label: '微服务 / 分布式', focus: '聚焦服务治理、缓存、消息与分布式方案' },
  { id: 'performance', label: '高并发 / 性能', focus: '聚焦 JVM、并发、数据库、缓存与故障排查' },
  { id: 'architecture', label: '架构 / 技术负责人', focus: '聚焦系统设计、技术选型、治理与稳定性' },
]

const CATEGORY_KEYS: CategoryKey[] = [
  'java',
  'jvm',
  'concurrency',
  'spring',
  'mysql',
  'redis',
  'message-queue',
  'microservice',
  'transaction',
  'distributed-lock',
  'sharding',
  'middleware',
  'network',
  'architecture',
  'scenario',
  'performance',
  'algorithm',
  'ai',
  'engineering',
  'scheduler',
  'file-processing',
  'experience',
  'soft-skills',
]

const EXPERIENCE_CATEGORIES: Record<ExperienceLevel, CategoryKey[]> = {
  graduate: [
    'java', 'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'network', 'scenario',
    'performance', 'algorithm', 'engineering', 'soft-skills',
  ],
  'one-year': [
    'java', 'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'middleware', 'network',
    'scenario', 'performance', 'algorithm', 'engineering', 'scheduler',
    'file-processing', 'soft-skills',
  ],
  'three-years': [
    'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'sharding', 'middleware',
    'architecture', 'scenario', 'performance', 'engineering', 'scheduler',
    'file-processing', 'soft-skills',
  ],
  'five-years': [
    'java', 'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'sharding', 'middleware',
    'architecture', 'scenario', 'performance', 'engineering', 'scheduler',
    'file-processing', 'soft-skills',
  ],
  'eight-years': [
    'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'sharding', 'middleware',
    'network', 'architecture', 'scenario', 'performance', 'engineering',
    'scheduler', 'soft-skills',
  ],
}

const ROLE_CATEGORIES: Record<Exclude<TargetRole, 'java-backend'>, CategoryKey[]> = {
  microservice: [
    'spring', 'mysql', 'redis', 'message-queue', 'microservice', 'transaction',
    'distributed-lock', 'sharding', 'middleware', 'architecture', 'scenario',
    'performance', 'engineering', 'scheduler',
  ],
  performance: [
    'jvm', 'concurrency', 'mysql', 'redis', 'message-queue', 'distributed-lock',
    'sharding', 'network', 'architecture', 'scenario', 'performance', 'algorithm',
    'engineering',
  ],
  architecture: [
    'jvm', 'concurrency', 'spring', 'mysql', 'redis', 'message-queue',
    'microservice', 'transaction', 'distributed-lock', 'sharding', 'middleware',
    'network', 'architecture', 'scenario', 'performance', 'engineering',
    'scheduler', 'soft-skills',
  ],
}

const EARLY_CAREER_FOUNDATIONS = new Set<CategoryKey>([
  'java', 'jvm', 'concurrency', 'spring', 'mysql',
])

const CURATED_CATEGORY_BY_ID: Record<string, CategoryKey> = {
  core: 'java',
  lambda: 'java',
  'functional-interface': 'java',
  stream: 'java',
  optional: 'java',
  datetime: 'java',
  interface: 'java',
  collection: 'java',
  concurrency: 'concurrency',
  jvm: 'jvm',
  refactor: 'engineering',
  interview: 'soft-skills',
}

export function buildRecommendedTree(
  nodes: KnowledgeTreeNode[],
  profile: LearningProfile,
): KnowledgeTreeNode[] {
  const allowedCategories = resolveAllowedCategories(profile)
  return nodes.flatMap(node => {
    if (node.level === 0) {
      const children = filterRootChildren(node.children, allowedCategories)
      return children.length > 0 ? [{ ...node, children }] : []
    }
    return filterRootChildren([node], allowedCategories)
  })
}

export function getExperienceOption(level: ExperienceLevel): ExperienceOption {
  return EXPERIENCE_OPTIONS.find(option => option.id === level) ?? EXPERIENCE_OPTIONS[2]
}

export function getRoleOption(role: TargetRole): RoleOption {
  return ROLE_OPTIONS.find(option => option.id === role) ?? ROLE_OPTIONS[0]
}

export function isLearningProfile(value: unknown): value is LearningProfile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LearningProfile>
  return EXPERIENCE_OPTIONS.some(option => option.id === candidate.experience)
    && ROLE_OPTIONS.some(option => option.id === candidate.role)
}

function resolveAllowedCategories(profile: LearningProfile): Set<CategoryKey> {
  const experienceCategories = new Set(EXPERIENCE_CATEGORIES[profile.experience])
  if (profile.role === 'java-backend') return experienceCategories

  const roleCategories = new Set(ROLE_CATEGORIES[profile.role])
  const allowed = new Set(
    CATEGORY_KEYS.filter(category => experienceCategories.has(category) && roleCategories.has(category)),
  )

  if (profile.experience === 'graduate' || profile.experience === 'one-year') {
    EARLY_CAREER_FOUNDATIONS.forEach(category => {
      if (experienceCategories.has(category)) allowed.add(category)
    })
  }
  return allowed.size > 0 ? allowed : experienceCategories
}

function filterRootChildren(
  nodes: KnowledgeTreeNode[],
  allowedCategories: Set<CategoryKey>,
): KnowledgeTreeNode[] {
  return nodes.flatMap(node => {
    const categoryKey = resolveCategoryKey(node)
    if (node.nodeType === 'CATEGORY' && categoryKey && !allowedCategories.has(categoryKey)) {
      return []
    }
    return [node]
  })
}

function resolveCategoryKey(node: KnowledgeTreeNode): CategoryKey | null {
  const curated = CURATED_CATEGORY_BY_ID[node.id]
  if (curated) return curated
  const match = node.id.match(/^yuque-cat-(\d{2})_/)
  if (!match) return null
  return CATEGORY_KEYS[Number(match[1]) - 1] ?? null
}
