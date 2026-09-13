import { http } from '@/lib/api'

export interface GitWorkspace {
  branch: string
  head: string
  upstream: string
  remote: string
  targetBranch: string
  destinations: string[]
  ahead: number | null
  behind: number | null
  files: { x: string; y: string; path: string; origPath: string | null }[]
  commits: { hash: string; author: string; date: string; subject: string }[]
  pushBlockedReason: string
  token: string
}

const endpoint = (id: string) => `/project-registry/${encodeURIComponent(id)}/git`
export const getGitWorkspace = (id: string) => http<GitWorkspace>(endpoint(id))
export const pushGitWorkspace = (id: string, token: string) => http<{ message: string }>(`${endpoint(id)}/push`, {
  method: 'POST', body: JSON.stringify({ token }),
})
