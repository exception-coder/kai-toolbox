import type { BackgroundTaskInfo, ConnState, PendingRequest, SessionRuntimeState } from '../types'

export interface SessionExecutionStatus {
  kind: 'running' | 'background' | 'warning' | 'idle'
  label: string
  detail?: string
}

export interface SessionExecutionInput {
  running: boolean
  engineLabel: string
  connState: ConnState
  queueCheck?: { attempt: number; maxAttempts: number } | null
  interrupting?: boolean
  pending?: PendingRequest | null
  backgroundTasks: BackgroundTaskInfo[]
  runtimeState?: SessionRuntimeState
  runtimePending: boolean
  runtimeError: boolean
}

function runningLabel(engineLabel: string, queueCheck?: SessionExecutionInput['queueCheck']): string {
  return queueCheck
    ? `正在核对上一轮是否完成 · ${queueCheck.attempt}/${queueCheck.maxAttempts}`
    : `${engineLabel} 正在运行`
}

/** 主状态只投影执行证据；历史 result 不参与空闲判断，也不授予发送权限。 */
export function deriveSessionExecutionStatus(input: SessionExecutionInput): SessionExecutionStatus | null {
  const { running, engineLabel, connState, queueCheck, pending, backgroundTasks, runtimeState: runtime } = input
  if (connState !== 'ready') {
    return { kind: running ? 'running' : 'warning', label: '正在重连会话…',
      detail: 'Agent 可能仍在后台执行，连接恢复前不会误判为空闲。' }
  }
  if (input.interrupting) return { kind: 'running', label: '正在终止…', detail: '正在等待引擎确认停止，待发送消息保留。' }
  if (pending) {
    return { kind: 'warning', label: pending.kind === 'question' ? '等待你回答' : '等待你的确认' }
  }
  if (input.runtimeError) {
    return { kind: 'warning', label: '全链路状态暂不可用', detail: '发送前仍会由后端再次核对会话状态。' }
  }
  if (runtime && (runtime.stale || runtime.consistency !== 'CONSISTENT')) {
    return { kind: 'warning', label: `状态待校正 · ${runtimeStatusLabel(runtime.effectiveStatus)}`, detail: runtime.reason }
  }
  if (runtime?.effectiveStatus === 'AWAITING_INPUT') {
    return { kind: 'warning', label: '等待你回答', detail: '请处理当前会话中的提问。' }
  }
  if (runtime?.effectiveStatus === 'RETRYING') {
    const retry = runtime.nativeStatus
    const progress = retry?.attempt != null ? ` · ${retry.attempt}${retry.maxAttempts != null ? `/${retry.maxAttempts}` : ''}` : ''
    return { kind: 'running', label: `引擎自动重试中${progress}`,
      detail: retry?.retryDelayMs ? `约 ${Math.ceil(retry.retryDelayMs / 1000)} 秒后重试；当前任务仍在执行。` : '当前任务仍在执行，待发送消息保留。' }
  }
  if (runtime?.effectiveStatus === 'ENGINE_UNAVAILABLE') {
    return { kind: 'warning', label: `${engineLabel} 当前不可用`, detail: '引擎报告异常，等待本轮清理后可在会话配置中检查账号与模型。' }
  }
  if (runtime?.pendingDecision || runtime?.effectiveStatus === 'AWAITING_DECISION') {
    return { kind: 'warning', label: '等待你的确认', detail: runtime.reason }
  }
  if (runtime?.effectiveStatus === 'FINALIZING') {
    return { kind: 'running', label: '正在收口本轮结果…', detail: runtime.reason }
  }
  if (running) {
    return { kind: 'running', label: runningLabel(engineLabel, queueCheck),
      detail: queueCheck ? 'Forge 正在让 Agent 确认上一项任务是否全部完成，确认后才会派发下一条排队消息。' : undefined }
  }
  const backgroundCount = Math.max(backgroundTasks.length, runtime?.backgroundTaskCount ?? 0)
  if (backgroundCount > 0 || runtime?.effectiveStatus === 'BACKGROUND_RUNNING') {
    return { kind: 'background', label: `后台任务进行中${backgroundCount ? ` · ${backgroundCount}` : ''}`,
      detail: backgroundTasks[0]?.description || backgroundTasks[0]?.taskType || runtime?.reason }
  }
  if (runtime?.effectiveStatus === 'RUNNING') {
    return { kind: 'running', label: runningLabel(engineLabel, queueCheck), detail: runtime.phase || runtime.reason }
  }
  if (runtime?.effectiveStatus === 'RECONNECTING') return { kind: 'running', label: '正在重连会话…', detail: runtime.reason }
  if (runtime?.effectiveStatus === 'INTERRUPTED') return { kind: 'warning', label: '本轮已中断', detail: runtime.reason }
  if (runtime?.effectiveStatus === 'UNKNOWN') return { kind: 'warning', label: '会话状态待确认', detail: runtime.reason }
  if (input.runtimePending || !runtime) return null
  if (runtime.effectiveStatus === 'IDLE' && runtime.canSend) return { kind: 'idle', label: '已就绪' }
  return { kind: 'warning', label: '会话状态待确认', detail: runtime.reason }
}

export function runtimeStatusLabel(status: SessionRuntimeState['effectiveStatus']): string {
  switch (status) {
    case 'RUNNING': return '运行中'
    case 'AWAITING_DECISION': return '等待确认'
    case 'AWAITING_INPUT': return '等待回答'
    case 'RETRYING': return '自动重试中'
    case 'ENGINE_UNAVAILABLE': return '引擎不可用'
    case 'FINALIZING': return '正在收口'
    case 'BACKGROUND_RUNNING': return '后台作业中'
    case 'RECONNECTING': return '正在重连'
    case 'INTERRUPTED': return '已中断'
    case 'IDLE': return '空闲'
    default: return '状态待确认'
  }
}
