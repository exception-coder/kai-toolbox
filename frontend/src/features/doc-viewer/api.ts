import { http } from '@/lib/api'
import type {
  CreateLocalSourceRequest,
  CreateSourceRequest,
  FileDTO,
  LocalFileDTO,
  LocalSourceDTO,
  LocalTreeResponseDTO,
  RefreshOutcomeDTO,
  SaveLocalFileRequest,
  SaveLocalFileResponse,
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

// === 本地目录源 ===

export function listLocalSources() {
  return http<LocalSourceDTO[]>('/doc-viewer/local/sources')
}

export function createLocalSource(payload: CreateLocalSourceRequest) {
  return http<LocalSourceDTO>('/doc-viewer/local/sources', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function deleteLocalSource(id: string) {
  return http<void>(`/doc-viewer/local/sources/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getLocalTree(id: string) {
  return http<LocalTreeResponseDTO>(`/doc-viewer/local/sources/${encodeURIComponent(id)}/tree`)
}

export function getLocalFile(id: string, path: string) {
  const q = new URLSearchParams({ path }).toString()
  return http<LocalFileDTO>(`/doc-viewer/local/sources/${encodeURIComponent(id)}/file?${q}`)
}

export function saveLocalFile(id: string, payload: SaveLocalFileRequest) {
  return http<SaveLocalFileResponse>(`/doc-viewer/local/sources/${encodeURIComponent(id)}/file`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}
