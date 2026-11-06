import { http } from '@/lib/api'
import type { CommitInfo, GitRepoRef } from '../types'

export interface ReviewEntry { path: string; name: string; type: 'tree' | 'blob' | 'link' | 'commit' }
export interface ReviewTree { ref: string; entries: ReviewEntry[]; hasMore: boolean }
export interface ReviewHistory { ref: string; commits: CommitInfo[]; hasMore: boolean }
export interface ReviewChange { path: string; oldPath: string | null; status: string; x: string; y: string }
export interface ReviewChanges { base: string; target: string; files: ReviewChange[] }
export interface ReviewContent { path: string; before: string; after: string; status: string; notice: string }
export interface ExplorerProps {
  title: string
  endpoint: string
  onClose: () => void
  restoreFocus?: () => void
  fetchRepos?: () => Promise<GitRepoRef[]>
}
export function reviewRequest<T>(endpoint: string, repo: string, action: string, params: Record<string, string | number> = {}, signal?: AbortSignal) {
  const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])), ...(repo ? { repo } : {}) })
  return http<T>(`${endpoint}/${action}?${query}`, { signal })
}
export const statusNames: Record<string, string> = { A: '新增', M: '修改', D: '删除', R: '重命名', C: '复制', U: '冲突', T: '类型变化' }
