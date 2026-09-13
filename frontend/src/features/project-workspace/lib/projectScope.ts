export interface ProjectScope { name: string; path: string }

export function projectPathKey(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[A-Za-z]:|^\/\//.test(normalized) ? normalized.toLowerCase() : normalized
}

export function isWithinProject(path: string, projectPath: string): boolean {
  const root = projectPathKey(projectPath)
  const candidate = projectPathKey(path)
  return Boolean(root && candidate) && (candidate === root || candidate.startsWith(`${root}/`))
}
