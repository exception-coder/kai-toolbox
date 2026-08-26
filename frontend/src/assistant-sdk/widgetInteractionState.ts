export interface WidgetInteractionState {
  busy: boolean
  interruptible: boolean
  activityVisible: boolean
  activityLabel: string
  tone: 'active' | 'warning' | 'error'
}

const BUSY_STATES = new Set([
  '正在准备上下文',
  '正在连接',
  '正在载入页面会话',
  '正在重连',
  '正在确认消息是否送达',
  '消息等待重连',
  '回复中',
  '消息处理中',
  '后台处理中',
  '消息待发送',
  '等待确认',
  '正在中止',
])

const INTERRUPTIBLE_STATES = new Set([
  '正在准备上下文', '正在连接', '正在重连', '回复中', '消息处理中', '后台处理中',
])

const ACTIVITY_LABELS: Record<string, string> = {
  正在准备上下文: '正在准备当前页面上下文…',
  正在连接: '正在连接助手…',
  正在载入页面会话: '正在连接当前页面会话…',
  正在重连: '连接中断，正在恢复会话…',
  正在确认消息是否送达: '正在确认消息是否已送达…',
  消息等待重连: '消息尚未送达，连接恢复后将自动重试…',
  回复中: 'AI 正在生成回复…',
  消息处理中: '消息正在处理…',
  后台处理中: '后台任务仍在处理…',
  消息待发送: '消息已保存，等待连接稳定后发送…',
  等待确认: '等待确认后继续…',
  正在中止: '正在中止当前请求…',
  部分消息待同步: '部分历史消息仍在同步…',
}

export function deriveWidgetInteractionState(state?: string, queueSize = 0): WidgetInteractionState {
  if (!state) {
    return { busy: false, interruptible: false, activityVisible: false, activityLabel: '', tone: 'active' }
  }
  const busy = BUSY_STATES.has(state)
  const error = isErrorState(state)
  const warning = state === '部分消息待同步' || state === '消息待发送'
    || state === '等待确认' || state === '消息等待重连'
  const baseLabel = ACTIVITY_LABELS[state] ?? state
  const queueLabel = queueSize > 0 ? `${baseLabel}（待发送 ${queueSize} 条）` : baseLabel
  return {
    busy,
    interruptible: INTERRUPTIBLE_STATES.has(state),
    activityVisible: busy || error || warning,
    activityLabel: queueLabel,
    tone: error ? 'error' : warning ? 'warning' : 'active',
  }
}

function isErrorState(state: string): boolean {
  return state.includes('失败') || state.includes('异常') || state.includes('不可用')
    || state.includes('未送达') || state === '认证失败'
}
