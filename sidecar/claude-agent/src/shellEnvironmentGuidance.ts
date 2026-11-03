/** Prompt-only preset. The legacy experiment flag still accepts an explicit opt-out. */
export function appendShellEnvironmentGuidance(
  instructions: string | undefined,
  context: { cwd: string; engine: string; toolPolicy: string; demo: boolean },
  enabled = process.env.FORGE_SHELL_GUIDANCE_EXPERIMENT !== '0',
  platform = process.platform,
): string | undefined {
  if (!enabled || context.demo || ['disabled', 'review-only', 'consult-readonly'].includes(context.toolPolicy)) {
    return instructions
  }
  const guidance = [
    '<forge_shell_environment preset="environment-default">',
    `Forge host OS: ${JSON.stringify(platform)}; Harness: ${JSON.stringify(context.engine)}.`,
    `Session working directory: ${JSON.stringify(context.cwd)}.`,
    'Execution shell type/version: not reported to Forge. Available native execution tools: use the current Harness tool schema; Forge does not invent a tool inventory.',
    'Prefer native Harness tools. Its environment context is authoritative; the host OS, parent process environment and an installed shell do not prove which shell a tool executes.',
    'Before the first shell command, use the native environment context/tool schema to identify the actual shell and version. If missing, use a native environment inspection capability when available; otherwise keep the uncertainty explicit. Reuse that evidence unless the execution environment changes.',
    'Follow the actual shell syntax without mixing dialects. When it is PowerShell, prefer PowerShell-native commands and compatible syntax.',
    'On failure, diagnose the original native result and correct the cause instead of repeating the same failed command. A test/build failure or an empty search result is not by itself a shell compatibility error.',
    'Only for an explicit shell parser or parameter-binding compatibility error, briefly remind yourself of the confirmed shell once per session, then follow the native Harness recovery. Do not add a reminder to every tool call.',
    'Do not switch shells, install tools or change the project environment merely because one command failed. This guidance grants no extra permissions.',
    '</forge_shell_environment>',
  ].join('\n')
  return [instructions, guidance].filter(Boolean).join('\n\n')
}
