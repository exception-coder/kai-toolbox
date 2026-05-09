import { http } from '@/lib/api'
import type {
  CreateSourceRequest,
  FileDTO,
  RefreshOutcomeDTO,
  SourceDTO,
  TreeResponseDTO,
} from './types'

export function listSources() {
  return http<SourceDTO[]>('/doc-viewer/sources')
}

export function createSource(payload: CreateSourceRequest) {
  return http<SourceDTO>('/doc-viewer/sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteSource(id: string) {
  return http<void>(`/doc-viewer/sources/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function refreshSource(id: string) {
  return http<RefreshOutcomeDTO>(`/doc-viewer/sources/${encodeURIComponent(id)}/refresh`, {
    method: 'POST',
  })
}

export function getTree(id: string) {
  return http<TreeResponseDTO>(`/doc-viewer/sources/${encodeURIComponent(id)}/tree`)
}

export function getFile(id: string, path: string) {
  const q = new URLSearchParams({ path }).toString()
  return http<FileDTO>(`/doc-viewer/sources/${encodeURIComponent(id)}/file?${q}`)
}
