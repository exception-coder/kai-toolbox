// Compatibility exports. Execution orchestration is owned by execution/.
export * from '../execution/service.js'
export { discoverExecution } from '../execution/context.js'
export { git, fileDigest, inputFingerprint } from '../execution/repository.js'
export { isBranchMutation } from '../execution/policy.js'
