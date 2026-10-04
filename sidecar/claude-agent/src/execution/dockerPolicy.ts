/** Supervised execution cannot depend on a local container daemon. */
export function isDockerDependentCommand(command: string): boolean {
  const normalized = command.replace(/["'`]/g, '').replace(/\\\r?\n/g, ' ')
  return /(?:^|[;&|()\r\n])\s*(?:docker(?:-compose)?|wsl)(?:\.exe)?(?:\s|$|[;&|()])/i.test(normalized)
    || /(?:^|[;&|()\r\n])\s*start-process\s+docker\s+desktop\b/i.test(normalized)
    || /\b(?:cmd(?:\.exe)?\s+\/c|(?:pwsh|powershell)(?:\.exe)?\s+-(?:command|c))\s+(?:docker|wsl)\b/i.test(normalized)
    || /(?:^|[\s;&|()])(?:mvnw?|gradlew?|java|npm|pnpm)(?:\.cmd|\.exe)?\b[^\r\n]*testcontainers/i.test(normalized)
}
