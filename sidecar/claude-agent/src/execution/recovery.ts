/** Stable recovery semantics shared by MCP and lifecycle hooks; never implies a PASS. */
export function executionRecovery(code: string) {
  const groups: Array<[string[], string, string, string]> = [
    [['WORKSPACE_BUSY'], 'CONFLICT', 'inspect_execution_writer', '比较实际冲突范围；属于本会话则按原执行增补，属于他人则等待或推进独立任务，不中止他人执行'],
    [['EXECUTION_UPDATE_REQUIRED', 'IMPLEMENTATION_SCOPE_DRIFT', 'SPEC_DEPENDENCY_MISSING'], 'REBIND', 'inspect_execution_writer', '核对原执行版本，重新探索完整文件和规格依赖；同任务携带 update 增补，保留旧范围和记录'],
    [['SPEC_INDEX_STALE', 'DISCOVERY_STALE'], 'REBIND', 'discover_execution', '重读实际变化的依赖并具名评估；旧记录缺少依赖时登记完整 specDependencies，不删除记录'],
    [['STAGED_INPUT_MISMATCH'], 'SNAPSHOT', 'inspect_execution_writer', '核对测试快照与本执行差异；共享暂存区使用 commit_execution，禁止整体暂存其他任务'],
    [['VERIFICATION_PENDING', 'VERIFICATION_NOT_RUN'], 'VERIFY_REMAINDER', 'run_execution_verification', '保持 inputFiles，只执行缺失类别或 pendingChecks，引用已通过证据'],
    [['VERIFICATION_STALE', 'VERIFICATION_FAILED'], 'REPAIR', 'run_execution_verification', '先修复具体失败或变化，再运行受影响检查；不重复未修正的失败命令'],
    [['COMMIT_RESULT_UNCERTAIN', 'EXECUTION_CONTEXT_MISMATCH'], 'RECONCILE', 'inspect_execution_writer', '先核对最新 Git 提交、执行身份与证据；不重复提交或自动释放执行'],
  ]
  const match = groups.find(([codes]) => codes.includes(code))
  return match ? { category: match[1], nextTool: match[2], action: match[3], retry: 'AFTER_STATE_OR_INPUT_CHANGE', automaticRetry: false }
    : { category: 'DIAGNOSE', nextTool: 'session_init', action: '保留错误证据，定位具体原因后再决定恢复；不要原样循环请求', retry: 'AFTER_DIAGNOSIS', automaticRetry: false }
}
