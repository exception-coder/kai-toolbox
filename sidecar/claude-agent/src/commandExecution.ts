export type CommandOutcome =
  | 'running'
  | 'success'
  | 'shellSyntax'
  | 'argumentEscaping'
  | 'commandNotFound'
  | 'permissionDenied'
  | 'timeout'
  | 'noMatches'
  | 'testFailure'
  | 'buildFailure'
  | 'processFailure'

export type CommandSeverity = 'running' | 'success' | 'info' | 'warning' | 'error'

export interface CommandClassification {
  outcome: CommandOutcome
  severity: CommandSeverity
  title: string
}

const COMMAND_TOOL = /^(?:bash|shell|command|execute|terminal|powershell|run_shell_command)$/i

/**
 * Provider-neutral command result classification. Providers disagree on whether a non-zero exit
 * is a tool error, so the UI must use observable command/output facts instead of that coarse bit.
 */
export function classifyCommandResult(
  toolName: string,
  command: string | undefined,
  output: string | undefined,
  failed: boolean,
): CommandClassification | undefined {
  if (!isCommandTool(toolName)) return undefined
  if (!failed) return { outcome: 'success', severity: 'success', title: '命令执行完成' }

  const text = `${command ?? ''}\n${output ?? ''}`
  if (/Cannot convert ['"]?System\.Object\[\]['"]?.*parameter ['"]?Filter|Specified method is not supported/i.test(text)) {
    return { outcome: 'argumentEscaping', severity: 'error', title: 'PowerShell 参数拼接错误' }
  }
  if (/ParserError|Missing argument in parameter list|Unexpected token|The string is missing the terminator|At line:\d+ char:/i.test(text)) {
    return { outcome: 'shellSyntax', severity: 'error', title: 'PowerShell 命令语法错误' }
  }
  if (/is not recognized as the name of a cmdlet|CommandNotFoundException|command not found|ENOENT|not recognized as an internal or external command/i.test(text)) {
    return { outcome: 'commandNotFound', severity: 'warning', title: '执行环境缺少命令' }
  }
  if (/Access is denied|Permission denied|UnauthorizedAccessException|EACCES|EPERM/i.test(text)) {
    return { outcome: 'permissionDenied', severity: 'warning', title: '命令权限受限' }
  }
  if (/timed?\s*out|timeout|ETIMEDOUT/i.test(text)) {
    return { outcome: 'timeout', severity: 'warning', title: '命令执行超时' }
  }
  if (isSearchWithoutMatches(command, output)) {
    return { outcome: 'noMatches', severity: 'info', title: '未找到匹配内容' }
  }
  if (/Tests run:\s*\d+.*(?:Failures|Errors):\s*[1-9]|There (?:was|were) failing test|test(?:s)? failed|FAILURE.*(?:test|surefire)/is.test(text)) {
    return { outcome: 'testFailure', severity: 'warning', title: '测试未通过' }
  }
  if (/BUILD FAILURE|COMPILATION ERROR|Compilation failed|Build failed with an exception/i.test(text)) {
    return { outcome: 'buildFailure', severity: 'warning', title: '构建未通过' }
  }
  return { outcome: 'processFailure', severity: 'warning', title: '命令返回非零结果' }
}

export function isCommandTool(toolName: string): boolean {
  return COMMAND_TOOL.test(toolName.trim())
}

function isSearchWithoutMatches(command: string | undefined, output: string | undefined): boolean {
  if (!command || !/^\s*(?:rg|grep|findstr)(?:\.exe)?(?:\s|$)/i.test(command)) return false
  return !output?.trim()
}
