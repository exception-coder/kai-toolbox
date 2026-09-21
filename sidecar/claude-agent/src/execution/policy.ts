import type { Assessment, VerificationKind } from './contracts.js'

export const POLICY_VERSION = 1
export const BRANCH_POLICY = {
  mode: 'shared_change_branch', createBranchPerTask: false, agentAutoBranch: false, taskIsolation: 'commit',
} as const

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
    branch: BRANCH_POLICY,
    scheduling: 'sequential_single_writer',
  } as const
}

/** Conservative direct-command guard; arbitrary scripts still need host sandbox mediation. */
export function isBranchMutation(command: string) {
  const normalized = command.replace(/["'`]/g, '').replace(/\\\r?\n/g, ' ')
  if (/\bgit(?:\.exe)?\b[^\r\n;&|]*\b(?:switch|checkout|worktree|symbolic-ref|update-ref)\b/i.test(normalized)) return true
  return [...normalized.matchAll(/\bgit(?:\.exe)?\b[^\r\n;&|]*\bbranch\b([^\r\n;&|]*)/gi)]
    .some(match => !/^(?:--show-current|--list|--all|--remotes|-a|-r)?$/.test(match[1].trim()))
}
