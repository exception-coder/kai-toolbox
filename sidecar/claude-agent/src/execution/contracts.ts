import { z } from 'zod'
import { identifier } from '../specResolution/contracts.js'

const file = z.string().min(1).max(500)
export const executionContextSchema = z.object({ project: z.string().min(1), sessionId: z.string().min(1).max(200) })
export const abortExecutionSchema = z.object({ project: z.string().min(1), executionId: z.string().regex(/^ex_[a-f0-9]{32}$/),
  ownerSessionId: z.string().min(1).max(200), branch: z.string().min(1).max(200),
  expectedCurrentBranch: z.string().max(200).optional(),
  actor: z.string().min(1).max(200), reason: z.string().min(15).max(2000),
  expectedHead: z.string().regex(/^[a-f0-9]{40,64}$/), expectedScopeFingerprint: z.string().length(64) })
export const resolveContextSchema = executionContextSchema.extend({
  request: z.string().min(2).max(16000), files: z.array(file).max(200).default([]),
  terms: z.array(z.string().max(100)).max(12).default([]),
})
export const executionEventSchema = z.object({
  project: z.string().min(1), sessionId: z.string().min(1).max(200).optional(),
  event: z.enum(['WRITE', 'COMMIT', 'STOP', 'GIT']),
  files: z.array(file).max(1000).default([]), command: z.string().max(32000).default(''),
  changeId: identifier.optional(), legacyMode: z.enum(['warn', 'block']).default('warn'),
})
export const discoverExecutionSchema = executionContextSchema.extend({
  request: z.string().min(2).max(16000), files: z.array(file).min(1).max(200), terms: z.array(z.string().max(100)).max(12).default([]),
})
export const assessExecutionSchema = executionContextSchema.extend({
  discoveryId: z.string().regex(/^ed_[a-f0-9]{32}$/), actor: z.string().min(1).max(200),
  behavior: z.enum(['preserved', 'changed', 'unknown']),
  design: z.enum(['none', 'detail', 'architecture']),
  impacts: z.array(z.enum(['logic', 'api', 'sql', 'ui', 'permission', 'state', 'migration'])).max(7),
  reason: z.string().min(15).max(4000), changeId: identifier.optional(),
  taskId: identifier.optional(),
  evidence: z.array(z.object({ path: file, quote: z.string().min(8).max(4000) })).min(1).max(20),
  designFiles: z.array(z.object({ path: file, level: z.enum(['overview', 'detail']) })).max(10).default([]),
})
export const executionCheckSchema = executionContextSchema.extend({
  operation: z.enum(['BEFORE_IMPLEMENTATION', 'BEFORE_COMMIT']).default('BEFORE_IMPLEMENTATION'),
  files: z.array(file).max(1000).default([]), command: z.string().max(32000).default(''),
})
export const verificationKind = z.enum(['regression', 'api', 'sql', 'ui', 'spec', 'design'])
export const runExecutionSchema = executionContextSchema.extend({
  checks: z.array(z.object({
    kind: verificationKind, program: z.string().min(1).max(500), args: z.array(z.string().max(4000)).max(100),
    replaces: z.string().regex(/^vc_[a-f0-9]{32}$/).optional().describe('更换失败命令时填写其返回的 checkId；只能替换同类别失败检查'),
    cwd: z.string().max(500).default('.').describe('项目相对目录或项目内绝对目录'), purpose: z.string().trim().min(1).max(2000).describe('说明该检查验证什么；中文短句即可'),
  })).min(1).max(20),
  inputFiles: z.array(file).min(1).max(1000).describe('必填：具体测试、配置和依赖文件；分批调用保持相同完整列表，不传未定义的缓存变量'), timeoutMs: z.number().int().min(100).max(120000).default(60000),
})
export type Assessment = z.infer<typeof assessExecutionSchema>
export type VerificationKind = z.infer<typeof verificationKind>
