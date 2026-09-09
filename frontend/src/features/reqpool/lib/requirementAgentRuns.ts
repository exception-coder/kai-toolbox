import type { PrdSessionView } from '@/features/prd-clarify/public-api'

export type RequirementAgentRunStatus = 'IDLE' | 'RUNNING' | 'WAITING_USER' | 'SUCCEEDED' | 'FAILED' | 'STALE'

export interface RequirementAgentRun {
  agentId: 'requirement-specification' | 'requirement-progress'
  name: string
  engine: 'codex' | 'claude' | null
  status: RequirementAgentRunStatus
  stage: string
  progress: number
  active: boolean
  error: string | null
  nextAction: string
  updatedAt: number | null
}

/** 将分散的规格与进度任务快照归一化为需求中枢的双 Agent 运行投影。 */
export function requirementAgentRuns(session?: PrdSessionView): RequirementAgentRun[] {
  return [specificationRun(session), progressRun(session)]
}

function specificationRun(session?: PrdSessionView): RequirementAgentRun {
  const base = {
    agentId: 'requirement-specification' as const,
    name: '需求规格分析 Agent',
    engine: session?.engine ?? null,
    error: null,
    updatedAt: session?.devDocWorkUpdatedAt ?? session?.updatedAt ?? null,
  }
  if (!session) return { ...base, status: 'IDLE', stage: '尚未启动', progress: 0, active: false, nextAction: '进入规格探索并选择执行引擎' }
  if (session.status === 'ERROR') return { ...base, status: 'FAILED', stage: '规格执行失败', progress: 100, active: false, error: session.errorMsg, nextAction: '查看错误后重新发起规格探索' }
  if (session.devDocWorkStatus === 'ERROR') return { ...base, status: 'FAILED', stage: '执行计划生成失败', progress: 100, active: false, error: session.devDocWorkError, nextAction: '保留现有规格并重试计划同步' }
  if (session.status === 'DISCOVERING') return { ...base, status: 'RUNNING', stage: '查询 Graphify、路由与源码证据', progress: 20, active: true, nextAction: '后台运行中，无需重复执行' }
  if (session.status === 'SPEC_REVIEW') return { ...base, status: 'WAITING_USER', stage: '初始化规格待确认', progress: 45, active: false, nextAction: '确认规格边界后继续生成核心规格' }
  if (session.status === 'CLARIFYING') return { ...base, status: 'WAITING_USER', stage: '业务事实待确认', progress: 55, active: false, nextAction: '回答关键问题后继续规格生成' }
  if (session.status === 'GENERATING') return { ...base, status: 'RUNNING', stage: '生成并校验核心规格', progress: 70, active: true, nextAction: '后台运行中，无需重复执行' }
  if (session.devDocWorkStatus === 'GENERATING') return { ...base, status: 'RUNNING', stage: session.devDocWorkProgress || '同步执行计划', progress: 88, active: true, nextAction: '后台运行中，无需重复执行' }
  if (session.devDocPath) return { ...base, status: 'SUCCEEDED', stage: '规格与执行计划已输出', progress: 100, active: false, nextAction: '由进度 Agent 核对真实代码实现' }
  return { ...base, status: 'WAITING_USER', stage: '核心规格已完成', progress: 80, active: false, nextAction: '同步生成 OpenSpec 执行计划' }
}

function progressRun(session?: PrdSessionView): RequirementAgentRun {
  const status = session?.progressWorkStatus
  const base = {
    agentId: 'requirement-progress' as const,
    name: '需求进度分析 Agent',
    engine: session?.engine ?? null,
    updatedAt: session?.progressWorkUpdatedAt ?? null,
  }
  if (status === 'RUNNING') return { ...base, status: 'RUNNING', stage: session?.progressWorkStage || '核对 OpenSpec、Graphify 与源码证据', progress: 50, active: true, error: null, nextAction: '后台运行中，无需重复执行' }
  if (status === 'ERROR') return { ...base, status: 'FAILED', stage: '代码进度核查失败', progress: 100, active: false, error: session?.progressWorkError ?? null, nextAction: '查看错误后重新执行进度分析' }
  if (status === 'COMPLETED') return { ...base, status: 'SUCCEEDED', stage: '真实进度已核验', progress: 100, active: false, error: null, nextAction: '代码或计划变化后重新核验' }
  if (!session?.devDocPath) return { ...base, status: 'IDLE', stage: '等待规格与计划', progress: 0, active: false, error: null, nextAction: '规格 Agent 完成后自动解锁' }
  return { ...base, status: 'IDLE', stage: '等待代码进度核查', progress: 0, active: false, error: null, nextAction: '启动只读代码分析' }
}
