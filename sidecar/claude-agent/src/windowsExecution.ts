const WINDOWS_EXECUTION_RULES = [
  'Windows command execution rules:',
  '- The Forge host operating system is Windows. The native Harness owns its execution shell; do not infer its type or version from the host OS. Follow the native environment context and tool schema.',
  '- The following PowerShell-specific notes apply only when the native tool actually uses PowerShell; preserve Bash or other native shell syntax otherwise.',
  '- Use rg for text search. For file discovery, use rg --files, fd, or valid Get-ChildItem syntax.',
  '- Get-ChildItem -Name is a switch, not a multi-pattern value; use -Include with quoted patterns or filter Name explicitly.',
  '- Quote each Maven/Gradle system-property argument that contains commas or PowerShell metacharacters, for example "-Dtest=A,B".',
  '- Prefer mvnw.cmd when the repository contains Maven Wrapper.',
  '- Do not wrap external CLIs such as git, mvn, gradle, npm, pnpm, node, java, docker, rg, fd, jq, or gh in an extra pwsh -Command layer unless PowerShell semantics are required.',
  '- Treat a non-zero build or test exit as development feedback. Inspect it and continue; do not describe it as a shell invocation failure.',
].join('\n')

export function windowsExecutionInstructions(): string | undefined {
  return process.platform === 'win32' ? WINDOWS_EXECUTION_RULES : undefined
}

export function appendWindowsExecutionInstructions(value?: string): string | undefined {
  return [windowsExecutionInstructions(), value?.trim()].filter(Boolean).join('\n\n') || undefined
}

export function prependWindowsExecutionInstructions(text: string): string {
  const rules = windowsExecutionInstructions()
  return rules ? `${rules}\n\nUser task:\n${text}` : text
}
