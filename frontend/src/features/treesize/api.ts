import { http } from '@/lib/api'
import { ensureFreshToken, getToken, withAuthToken } from '@/lib/auth'
import type {
  NodeView,
  ProbeResult,
  CleanupCandidate,
  ScanView,
  StartScanPayload,
  VideoConfig,
} from './types'

export function startScan(payload: StartScanPayload) {
  return http<ScanView>('/treesize/scans', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function getScan(id: string) {
  return http<ScanView>(`/treesize/scans/${id}`)
}

export function listScans() {
  return http<ScanView[]>('/treesize/scans')
}

export function getChildren(scanId: string, path?: string) {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  return http<NodeView[]>(`/treesize/scans/${scanId}/children${qs}`)
}

export function getCleanupCandidates(scanId: string) {
  return http<CleanupCandidate[]>(`/treesize/scans/${scanId}/cleanup-candidates`)
}

export function deleteScan(id: string) {
  return http<void>(`/treesize/scans/${id}`, { method: 'DELETE' })
}

/**
 * Server signals what happened to the file:
 * - {@code TRASHED} — moved to the OS recycle bin (recoverable)
 * - {@code PERMANENT} — recycle bin unavailable; permanently removed
 * - {@code QUEUED} — file was locked / IO failed; parked in the failed-delete registry
 *   for later batch retry (see {@code listFailedDeletes} / {@code retryFailedDeletes})
 *
 * Legacy {@code toTrash} stays true only when {@code outcome === 'TRASHED'}.
 */
export type DeleteOutcome = 'TRASHED' | 'PERMANENT' | 'QUEUED'
export interface DeleteFileResult {
  toTrash: boolean
  outcome: DeleteOutcome
}

export function deleteFile(scanId: string, path: string) {
  return http<DeleteFileResult>(`/treesize/scans/${scanId}/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}

export interface FailedDeleteView {
  scanId: string
  path: string
  reason: string
  attempts: number
  lastAttemptAt: number
}

export interface RetryFailedDeletesResultView {
  attempted: number
  deleted: number
  queued: number
  remaining: FailedDeleteView[]
}

export function listFailedDeletes() {
  return http<FailedDeleteView[]>('/treesize/file-delete/failed')
}

export function retryFailedDeletes() {
  return http<RetryFailedDeletesResultView>('/treesize/file-delete/failed/retry', {
    method: 'POST',
  })
}

export function clearFailedDeletes() {
  return http<void>('/treesize/file-delete/failed', { method: 'DELETE' })
}

export function removeFailedDelete(path: string) {
  return http<void>(`/treesize/file-delete/failed/entry?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}

export interface SymlinkPayload {
  sourcePath: string
  targetPath: string
  taskId?: string
}

export interface SymlinkResult {
  sourcePath: string
  targetPath: string
  movedBytes: number
}

export function createSymlink(scanId: string, payload: SymlinkPayload) {
  return http<SymlinkResult>(`/treesize/scans/${scanId}/symlink`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function symlinkEventsPath(taskId: string): string {
  return `/treesize/symlink-events/${taskId}`
}

export function getVideoConfig() {
  return http<VideoConfig>('/treesize/config')
}

/**
 * HEAD /probe — backend returns the decision in headers; we lift the ones the player needs.
 * Using HEAD avoids transferring an empty body and matches the api-doc contract.
 */
export async function probeVideo(scanId: string, path: string): Promise<ProbeResult> {
  // probe 是裸 fetch（要读响应头），不走 http()，需自己续期 + 带 token，否则软鉴权拦截后拿不到头。
  await ensureFreshToken()
  const token = getToken()
  const url = `/api${probePath(scanId, path)}`
  const res = await fetch(url, {
    method: 'HEAD',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new Error(`probe failed: ${res.status}`)
  }
  // Controller 执行过才会带 X-Ffmpeg-Available 头；缺头 = 被软鉴权拦（未授权），而非 ffmpeg 不可用。
  const ffmpegHeader = res.headers.get('X-Ffmpeg-Available')
  return {
    nativelyPlayable: res.headers.get('X-Native-Playable') === 'true',
    container: res.headers.get('X-Container') ?? 'unknown',
    videoCodec: res.headers.get('X-Video-Codec') ?? 'unknown',
    audioCodec: res.headers.get('X-Audio-Codec') ?? '(none)',
    durationSeconds: Number(res.headers.get('X-Duration-Seconds') ?? 0),
    ffmpegAvailable: ffmpegHeader === 'true',
    authorized: ffmpegHeader !== null,
  }
}

export function streamUrl(scanId: string, path: string): string {
  return withAuthToken(`/api/treesize/scans/${scanId}/stream?path=${encodeURIComponent(path)}`)
}

export function hlsPlaylistUrl(scanId: string, path: string): string {
  return withAuthToken(`/api/treesize/scans/${scanId}/hls/playlist.m3u8?path=${encodeURIComponent(path)}`)
}

function probePath(scanId: string, path: string): string {
  return `/treesize/scans/${scanId}/probe?path=${encodeURIComponent(path)}`
}
