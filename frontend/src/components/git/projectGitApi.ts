import { http } from '@/lib/api'
import type { GitFileDiffResponse, GitStatusResponse } from './types'

/** Lists staged, unstaged and untracked files for a project repository. */
export function getProjectGitStatus(path: string) {
  const params = new URLSearchParams({ path })
  return http<GitStatusResponse>(`/projects/git/status?${params.toString()}`)
}

/** Returns the unified diff for one changed project file. */
export function getProjectGitFileDiff(path: string, filePath: string, x: string) {
  const params = new URLSearchParams({ path, filePath, x })
  return http<GitFileDiffResponse>(`/projects/git/file-diff?${params.toString()}`)
}
