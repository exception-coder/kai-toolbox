import type { AgentEngine } from '../types'

const ENGINE_LABEL: Record<AgentEngine, string> = {
  codex: 'Codex',
  claude: 'Claude Code',
}

/** 将 Agent 运行时错误收敛为可操作的产品提示，避免直接暴露余额、请求 ID 等诊断细节。 */
export function analysisErrorMessage(cause: unknown, engine: AgentEngine): string {
  const label = ENGINE_LABEL[engine]
  const detail = cause instanceof Error ? cause.message : String(cause ?? '')
  if (/额度不足|insufficient\s+(credit|quota|balance)/i.test(detail)) {
    return `${label} 额度不足，原分析结果未变更。请选择另一个引擎后重试。`
  }
  if (/authenticate|authentication|鉴权|unauthorized|forbidden|\b403\b/i.test(detail)) {
    return `${label} 鉴权失败，原分析结果未变更。请切换引擎或检查账号配置后重试。`
  }
  if (/timeout|timed out|超时/i.test(detail)) {
    return `${label} 分析超时，原分析结果未变更。请稍后重试。`
  }
  return `${label} 分析失败，原分析结果未变更。请稍后重试或切换引擎。`
}
