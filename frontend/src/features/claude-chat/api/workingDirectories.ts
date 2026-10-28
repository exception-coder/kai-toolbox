import { http } from '@/lib/api'

export interface DirectoryListing {
  path: string
  parent: string | null
  directories: Array<{ name: string; path: string }>
  truncated: boolean
}

export const listDirectoryRoots = () => http<string[]>('/claude-chat/workspaces/directory-roots')
export const browseWorkingDirectory = (path: string) => http<DirectoryListing>(
  `/claude-chat/workspaces/directories${path ? `?path=${encodeURIComponent(path)}` : ''}`,
)
