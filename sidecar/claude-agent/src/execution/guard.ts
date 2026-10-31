import { existsSync } from 'node:fs'
import { resolve, relative, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkExecutionEvent } from './lifecycle.js'
import { isBranchMutation } from './policy.js'

/** Shared permission adapter. Unbound sessions retain their existing host policy. */
export function guardExecutionTool(project: string, sessionId: string, tool: string, input: Record<string, unknown>): string | undefined {
  let root = resolve(project)
  while (!existsSync(join(root, '.git')) && dirname(root) !== root) root = dirname(root)
  if (!existsSync(join(root, '.git'))) return undefined
  try {
    const command = String(input.command || input.cmd || '')
    const shell = ['Bash', 'exec_command'].includes(tool)
    const commit = shell && /\bgit(?:\.exe)?\b[^\r\n;&|]*\bcommit\b/i.test(command)
    const file = input.file_path ?? input.path
    const editing = ['Edit', 'Write', 'MultiEdit'].includes(tool) && typeof file === 'string'
    if (!editing && !commit && !(shell && isBranchMutation(command))) return undefined
    const files = editing ? [relative(root, resolve(project, file as string)).replace(/\\/g, '/')] : []
    // Planning remains writable so a denied change can repair its own artifacts.
    if (editing && files.every(file => /^(openspec\/|docs\/)/.test(file) || /\.(md|txt)$/i.test(file))) return undefined
    const result = checkExecutionEvent({ project: root, sessionId, files, command,
      event: commit ? 'COMMIT' : editing ? 'WRITE' : 'GIT' })
    if (!result.allowed && result.enforcement === 'block') {
      const cli = fileURLToPath(new URL('../specResolution/cli.js', import.meta.url))
      return `${result.code}: ${'message' in result ? result.message : ''}。既有执行仍受保护；相关操作已移出模型 MCP，使用内部兼容 CLI：node "${cli}" <操作名>，以标准输入传入原 JSON；参数可用 node "${cli}" --describe <操作名> 只读查看。不得清理原记录或关闭门禁。`
    }
    return undefined
  } catch (error) { return error instanceof Error ? error.message : String(error) }
}
