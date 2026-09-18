import { z } from 'zod'
import { identifier } from './contracts.js'

const file = z.string().min(1).max(500)
export const executionContextSchema = z.object({ project: z.string().min(1), sessionId: z.string().min(1).max(200) })
export const discoverExecutionSchema = executionContextSchema.extend({
  request: z.string().min(2).max(16000), files: z.array(file).min(1).max(200), terms: z.array(z.string().max(100)).max(12).default([]),
})
export const assessExecutionSchema = executionContextSchema.extend({
  discoveryId: z.string().regex(/^ed_[a-f0-9]{32}$/), actor: z.string().min(1).max(200),
  behavior: z.enum(['preserved', 'changed', 'unknown']),
  design: z.enum(['none', 'detail', 'architecture']),
  impacts: z.array(z.enum(['logic', 'api', 'sql', 'ui', 'permission', 'state', 'migration'])).max(7),
  reason: z.string().min(15).max(4000), changeId: identifier.optional(),
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
    cwd: z.string().max(500).default('.'), purpose: z.string().min(10).max(2000),
  })).min(1).max(20),
  inputFiles: z.array(file).min(1).max(1000), timeoutMs: z.number().int().min(100).max(120000).default(60000),
})
export type Assessment = z.infer<typeof assessExecutionSchema>
export type VerificationKind = z.infer<typeof verificationKind>

/** Risk chooses verification depth; behavior and architecture independently choose documents. */
export function executionPolicy(input: Assessment) {
  const verification = new Set<VerificationKind>(['regression'])
  if (input.impacts.includes('api') || input.impacts.includes('permission')) verification.add('api')
  if (input.impacts.includes('sql') || input.impacts.includes('migration')) verification.add('sql')
  if (input.impacts.includes('ui')) verification.add('ui')
  if (input.behavior === 'changed') verification.add('spec')
  if (input.design !== 'none') verification.add('design')
  return {
    spec: input.behavior === 'unknown' ? 'NEEDS_EVIDENCE' : input.behavior === 'changed' ? 'DELTA_REQUIRED' : 'NO_SPEC_CHANGE',
    design: input.design, verification: [...verification],
    branch: { mode: 'shared_change_branch', createBranchPerTask: false, agentAutoBranch: false, taskIsolation: 'commit' },
    scheduling: 'sequential_single_writer',
  } as const
}
