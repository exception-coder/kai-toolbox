// AI 优化子模块的类型定义。与主模块解耦：optimize 子目录只对外暴露 hook + 组件，
// 不与简历主流程的 state 形状耦合。
import type { EducationItem, ProjectExperience, ResumeBasics, ResumeData, WorkExperience } from '../types'

export type SectionType = 'WORK' | 'PROJECT' | 'SELF_INTRO'

export type SeniorityLevel = 'JUNIOR' | 'INTERMEDIATE' | 'SENIOR' | 'EXPERT'

export const SENIORITY_LEVELS: Readonly<Record<SeniorityLevel, { label: string; range: string }>> = {
  JUNIOR: { label: '初级', range: '0-2 年' },
  INTERMEDIATE: { label: '中级', range: '3-5 年' },
  SENIOR: { label: '高级', range: '6-9 年' },
  EXPERT: { label: '资深', range: '10+ 年' },
}

/**
 * 派生自简历 basics 的「岗位定位上下文」。
 * targetRole 取自 jobIntent；级别由 experienceYears 自动推断。
 * targetRole 为空时返回 undefined，OptimizeProvider 据此引导用户先填求职意向。
 */
export interface JobContext {
  targetRole: string
  experienceYears?: number
  seniorityLevel?: SeniorityLevel
}

/** 服务端返回的优化结果（schema 与 ResumeOptimizationResponseDTO 一致） */
export interface OptimizationResult {
  /** 结构化 section 是 JSON 字符串，自我介绍是纯文本 */
  optimizedContent: string
  changeNotes: string[]
  /** 与目标岗位 + 级别匹配的核心能力词（v1.1 字段名，旧的 matchedKeywords 已废弃） */
  highlightedSkills: string[]
  tokenUsage?: {
    promptTokens?: number
    completionTokens?: number
    totalTokens?: number
  }
}

/**
 * 从 basics.experienceYears 字符串提取整数年。
 * 例：「9 年工作经验」→ 9；空字符串 → undefined。
 */
export function parseExperienceYears(raw: string): number | undefined {
  if (!raw) return undefined
  const match = raw.match(/(\d+(?:\.\d+)?)/)
  if (!match) return undefined
  const n = parseFloat(match[1])
  if (!Number.isFinite(n) || n < 0) return undefined
  return Math.round(n)
}

export function inferSeniorityLevel(years: number | undefined): SeniorityLevel | undefined {
  if (years == null) return undefined
  if (years <= 2) return 'JUNIOR'
  if (years <= 5) return 'INTERMEDIATE'
  if (years <= 9) return 'SENIOR'
  return 'EXPERT'
}

export function deriveJobContext(basics: ResumeBasics): JobContext | undefined {
  const role = basics.jobIntent?.trim()
  if (!role) return undefined
  const years = parseExperienceYears(basics.experienceYears)
  return {
    targetRole: role,
    experienceYears: years,
    seniorityLevel: inferSeniorityLevel(years),
  }
}

/** 工作经历的 optimizedContent 反序列化后的结构 */
export type OptimizedWork = Pick<
  WorkExperience,
  'company' | 'role' | 'period' | 'responsibilities' | 'achievements'
>

/** 项目经历的 optimizedContent 反序列化后的结构 */
export type OptimizedProject = Pick<
  ProjectExperience,
  'name' | 'role' | 'period' | 'description' | 'responsibilities' | 'achievements'
>

/** 用于在请求时给 LLM 提供其他 section 的简要摘要（跨段一致性） */
export function buildOtherSectionsBrief(
  data: ResumeData,
  currentSection: SectionType,
  currentItemId?: string,
): string {
  const lines: string[] = []
  if (data.basics.advantage && currentSection !== 'SELF_INTRO') {
    lines.push(`【个人优势】${truncate(data.basics.advantage, 80)}`)
  }
  if (currentSection !== 'WORK' && data.work.length > 0) {
    lines.push(
      `【工作经历】共 ${data.work.length} 段：${data.work
        .map(w => `${w.company}-${w.role}`)
        .join('；')}`,
    )
  }
  if (currentSection !== 'PROJECT' && data.projects.length > 0) {
    lines.push(
      `【项目经历】共 ${data.projects.length} 个：${data.projects
        .map(p => `${p.name}(${p.role})`)
        .join('；')}`,
    )
  }
  // 同 section 内其他条目的标题（仅 WORK / PROJECT）
  if (currentSection === 'WORK' && currentItemId) {
    const others = data.work
      .filter(w => w.id !== currentItemId)
      .map(w => `${w.company}-${w.role}`)
    if (others.length > 0) lines.push(`【本人其他工作】${others.join('；')}`)
  }
  if (currentSection === 'PROJECT' && currentItemId) {
    const others = data.projects
      .filter(p => p.id !== currentItemId)
      .map(p => p.name)
    if (others.length > 0) lines.push(`【本人其他项目】${others.join('；')}`)
  }
  if (currentSection !== 'PROJECT' && currentSection !== 'WORK' && data.education.length > 0) {
    lines.push(
      `【教育】${data.education
        .map((e: EducationItem) => `${e.school} ${e.degree}-${e.major}`)
        .join('；')}`,
    )
  }
  return lines.join('\n')
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max) + '…'
}
