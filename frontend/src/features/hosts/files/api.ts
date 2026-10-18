import { authFetch, http } from '@/lib/api'
export type FileEntry = {
  name: string
  directory: boolean
  link: boolean
  size: number
  modified: number
}
export type Listing = {
  path: string
  entries: FileEntry[]
  truncated: boolean
}
const root = (id: string) => `/hosts/${encodeURIComponent(id)}/files`
export const listFiles = (id: string, path: string) =>
  http<Listing>(`${root(id)}?path=${encodeURIComponent(path)}`)
async function checked(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(body?.message ?? `操作失败 HTTP ${response.status}`)
  }
  return response
}
export async function readFile(id: string, path: string) {
  const response = await checked(
    await authFetch(`${root(id)}/download?path=${encodeURIComponent(path)}`),
  )
  return {
    blob: await response.blob(),
    sha256: response.headers.get('X-Content-SHA256') ?? '',
  }
}
export async function uploadFile(
  id: string,
  directory: string,
  name: string,
  file: File,
  expected?: string,
) {
  const body = new FormData()
  body.set('directory', directory)
  body.set('name', name)
  body.set('file', file)
  if (expected) body.set('expectedSha256', expected)
  const response = await checked(
    await authFetch(root(id), { method: 'POST', body }),
  )
  return response.json() as Promise<{
    path: string
    backup: string | null
    sha256: string
  }>
}
