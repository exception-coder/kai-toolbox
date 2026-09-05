import { z } from 'zod'

export const AUTOPILOT_DISPOSITIONS = [
  'CONTINUE', 'COMPLETE', 'WAITING_USER', 'BLOCKED', 'FAILED',
] as const

/** Sidecar 仅校验候选报告形状；运行身份与是否推进由 Forge Runtime 绑定和裁决。 */
export const AUTOPILOT_PROGRESS_INPUT_SCHEMA = {
  disposition: z.enum(AUTOPILOT_DISPOSITIONS),
  summary: z.string().max(2000).describe('本轮实际完成工作的简要说明'),
  nextAction: z.string().max(2000).optional().describe('CONTINUE 时必须填写的下一项动作'),
  remainingWork: z.array(z.string().max(500)).max(20).default([]),
  evidence: z.array(z.string().max(500)).max(20).default([])
    .describe('已执行命令或产物路径，不包含凭据和完整原始输出'),
  reason: z.string().max(2000).optional().describe('等待、阻塞或失败时的可操作原因'),
}

export const AUTOPILOT_PROGRESS_TOOL_ANNOTATIONS = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
} as const

export const autopilotProgressPayloadSchema = z.object(AUTOPILOT_PROGRESS_INPUT_SCHEMA)
