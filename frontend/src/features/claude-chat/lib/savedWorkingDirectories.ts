export const MAX_SAVED_WORKING_DIRECTORIES = 50

export function workingDirectoryKey(path: string): string {
  const normalized = path.trim().replaceAll('\\', '/').replace(/\/+$/, '') || '/'
  return /^(?:[a-z]:|\/\/)/i.test(normalized) ? normalized.toLowerCase() : normalized
}

export function savedWorkingDirectories(value: unknown): string[] {
  if (value == null) return []
  const entries = (value as { directories?: unknown }).directories
  if (!Array.isArray(entries) || entries.some(path => typeof path !== 'string'
    || !/^(?:[a-z]:[\\/]|\/|\\\\)/i.test(path) || /[\r\n\0]/.test(path))) {
    throw new Error('常用目录记录格式异常，请检查服务端偏好，未覆盖原记录。')
  }
  if (entries.length > MAX_SAVED_WORKING_DIRECTORIES) throw new Error('常用目录记录超过数量限制，未覆盖原记录。')
  return [...new Map((entries as string[]).map(path => [workingDirectoryKey(path), path])).values()]
}

export function addSavedWorkingDirectory(paths: string[], path: string): string[] {
  if (paths.some(value => workingDirectoryKey(value) === workingDirectoryKey(path))) return paths
  if (paths.length >= MAX_SAVED_WORKING_DIRECTORIES) throw new Error('最多保存 50 个常用目录，请先移除不再使用的目录。')
  return [...paths, path]
}
