// optimize 子模块对外门面：主模块只需要从这里 import，不感知内部目录
export { OptimizeProvider, useOptimize, type OptimizeTarget } from './OptimizeContext'
export { OptimizeButton } from './OptimizeButton'
export type { SectionType, OptimizationResult, SeniorityLevel, JobContext } from './types'
export { SENIORITY_LEVELS, parseExperienceYears, inferSeniorityLevel, deriveJobContext } from './types'
