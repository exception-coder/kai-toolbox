import { existsSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'
import { checkExecution, isBranchMutation, loadExecution } from './execution.js'

/** Shared permission adapter. Unbound sessions retain their existing host policy. */
export function guardExecutionTool(project: string, sessionId: string, tool: string, input: Record<string, unknown>): string | undefined {
  let root = resolve(project)
  while (!existsSync(join(root, '.git')) && dirname(root) !== root) root = dirname(root)
  if (!existsSync(join(root, '.forge', 'spec-resolution'))) return undefined
  try {
    const execution = loadExecution(root, sessionId)
    const command = String(input.command || input.cmd || '')
    const shell = ['Bash', 'exec_command'].includes(tool)
    const commit = shell && /\bgit(?:\.exe)?\b[^\r\n;&|]*\bcommit\b/i.test(command)
    const file = input.file_path ?? input.path
    const editing = ['Edit', 'Write', 'MultiEdit'].includes(tool) && typeof file === 'string'
    if (!editing && !commit && !(shell && isBranchMutation(command))) return undefined
    if (!execution) return existsSync(join(root, '.forge', 'spec-resolution', 'execution-writer.json'))
      ? 'WORKSPACE_BUSY: 共享工作区已有写入任务；先协调执行归属，不自行创建 worktree' : undefined
    const files = editing ? [relative(root, resolve(project, file as string)).replace(/\\/g, '/')] : []
    // Planning remains writable so a denied change can repair its own artifacts.
    if (editing && files.every(file => /^(openspec\/|docs\/)/.test(file) || /\.(md|txt)$/i.test(file))) return undefined
    checkExecution({ project: root, sessionId, files, command, operation: commit ? 'BEFORE_COMMIT' : 'BEFORE_IMPLEMENTATION' })
    return undefined
  } catch (error) { return error instanceof Error ? error.message : String(error) }
}
