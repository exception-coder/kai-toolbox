/** Keep one verification call below both the Forge watchdog and Codex MCP call deadlines. */
export const EXECUTION_VERIFICATION_CALL_BUDGET_MS = 4 * 60_000
export const EXECUTION_VERIFICATION_MCP_IDLE_MS = EXECUTION_VERIFICATION_CALL_BUDGET_MS + 30_000
export const EXECUTION_VERIFICATION_MCP_HARD_MS = EXECUTION_VERIFICATION_CALL_BUDGET_MS + 60_000
export const EXECUTION_VERIFICATION_CODEX_TIMEOUT_SEC = EXECUTION_VERIFICATION_MCP_HARD_MS / 1_000

export function isExecutionVerificationTool(name: string): boolean {
  return name === 'run_execution_verification' || name.endsWith('/run_execution_verification')
    || name.endsWith('__run_execution_verification')
}
