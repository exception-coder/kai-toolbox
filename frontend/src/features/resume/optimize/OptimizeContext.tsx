// 简历优化的 React Context：把抽屉触发逻辑、写回逻辑、岗位上下文派生集中到一处，
// 编辑器各处只需放 <OptimizeButton target=...> 即可，零冗余样板。
//
// v1.1 变更：去 JD 化。OptimizeProvider 不再接收 jobTarget；改为在每次 open 时
// 从 data.basics 通过 deriveJobContext 派生 { targetRole, experienceYears, seniorityLevel }。
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { OptimizeDiffSheet } from './OptimizeDiffSheet'
import {
  buildOtherSectionsBrief,
  deriveJobContext,
  type JobContext,
  type OptimizationResult,
  type SectionType,
} from './types'
import type {
  ProjectExperience,
  ResumeData,
  WorkExperience,
} from '../types'

/** 描述「这次要优化哪一段内容、接受后怎么写回」的请求载体 */
export interface OptimizeTarget {
  sectionType: SectionType
  /** 用于在抽屉标题里显示，例如「广州应奥科技」 */
  itemTitle?: string
  /** 提供原始内容（结构化 JSON 或纯文本） */
  buildOriginal: () => string
  /** 接受时把 LLM 返回的 optimizedContent 写回主状态 */
  applyAccepted: (result: OptimizationResult) => void
}

interface ContextValue {
  /** 由 OptimizeButton 调用，触发优化抽屉打开 */
  open: (target: OptimizeTarget) => void
  /** 求职意向是否已填（OptimizeButton 用来调按钮可用态） */
  hasJobIntent: boolean
}

const OptimizeCtx = createContext<ContextValue | null>(null)

interface ProviderProps {
  data: ResumeData
  children: React.ReactNode
}

export function OptimizeProvider({ data, children }: ProviderProps) {
  const [diffOpen, setDiffOpen] = useState(false)
  const [activeTarget, setActiveTarget] = useState<OptimizeTarget | null>(null)
  const [activeJob, setActiveJob] = useState<JobContext | null>(null)
  // 用 ref 持有最新 data，避免 buildOtherSectionsBrief 闭包失效
  const dataRef = useRef(data)
  dataRef.current = data

  const hasJobIntent = Boolean(data.basics.jobIntent?.trim())

  const open = useCallback(
    (target: OptimizeTarget) => {
      const job = deriveJobContext(dataRef.current.basics)
      if (!job) {
        alert('请先在「基本信息 · 求职意向」里填写目标岗位，再使用 AI 优化。')
        return
      }
      setActiveJob(job)
      setActiveTarget(target)
      setDiffOpen(true)
    },
    [],
  )

  const value = useMemo<ContextValue>(
    () => ({ open, hasJobIntent }),
    [open, hasJobIntent],
  )

  const original = activeTarget ? activeTarget.buildOriginal() : ''
  const brief = activeTarget
    ? buildOtherSectionsBrief(dataRef.current, activeTarget.sectionType, currentItemIdOf(activeTarget, dataRef.current))
    : ''

  return (
    <OptimizeCtx.Provider value={value}>
      {children}
      {activeTarget && activeJob && (
        <OptimizeDiffSheet
          open={diffOpen}
          onOpenChange={o => {
            setDiffOpen(o)
            if (!o) {
              setActiveTarget(null)
              setActiveJob(null)
            }
          }}
          sectionType={activeTarget.sectionType}
          itemTitle={activeTarget.itemTitle}
          originalContent={original}
          targetRole={activeJob.targetRole}
          experienceYears={activeJob.experienceYears}
          seniorityLevel={activeJob.seniorityLevel}
          otherSectionsBrief={brief}
          onAccept={result => activeTarget.applyAccepted(result)}
        />
      )}
    </OptimizeCtx.Provider>
  )
}

export function useOptimize(): ContextValue {
  const ctx = useContext(OptimizeCtx)
  if (!ctx) throw new Error('useOptimize 必须在 <OptimizeProvider> 内调用')
  return ctx
}

function currentItemIdOf(target: OptimizeTarget, data: ResumeData): string | undefined {
  if (target.sectionType === 'WORK') {
    return data.work.find((w: WorkExperience) => target.itemTitle?.includes(w.company))?.id
  }
  if (target.sectionType === 'PROJECT') {
    return data.projects.find((p: ProjectExperience) => target.itemTitle?.includes(p.name))?.id
  }
  return undefined
}
