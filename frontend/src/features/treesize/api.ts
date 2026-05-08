import { http } from '@/lib/api'
import type {
  NodeView,
  ProbeResult,
  CleanupCandidate,
  ScanView,
  SshHostPayload,
  SshHostView,
  StartScanPayload,
  TestSshHostResult,
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

/** Server signals whether the OS recycle bin actually accepted the file (false = permanent delete). */
export interface DeleteFileResult {
  toTrash: boolean
}

export function deleteFile(scanId: string, path: string) {
  return http<DeleteFileResult>(`/treesize/scans/${scanId}/file?path=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  })
}

export function listSshHosts() {
  return http<SshHostView[]>('/treesize/ssh-hosts')
}

export function createSshHost(payload: SshHostPayload) {
  return http<SshHostView>('/treesize/ssh-hosts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateSshHost(id: string, payload: SshHostPayload) {
  return http<SshHostView>(`/treesize/ssh-hosts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteSshHost(id: string) {
  return http<void>(`/treesize/ssh-hosts/${id}`, { method: 'DELETE' })
}

export function testSshHost(payload: SshHostPayload) {
  return http<TestSshHostResult>('/treesize/ssh-hosts/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function testSavedSshHost(id: string) {
  return http<TestSshHostResult>(`/treesize/ssh-hosts/${id}/test`, { method: 'POST' })
}

export function getVideoConfig() {
  return http<VideoConfig>('/treesize/config')
}

/**
 * HEAD /probe — backend returns the decision in headers; we lift the ones the player needs.
 * Using HEAD avoids transferring an empty body and matches the api-doc contract.
 */
export async function probeVideo(scanId: string, path: string): Promise<ProbeResult> {
  const url = `/api${probePath(scanId, path)}`
  const res = await fetch(url, { method: 'HEAD' })
  if (!res.ok) {
    throw new Error(`probe failed: ${res.status}`)
  }
  return {
    nativelyPlayable: res.headers.get('X-Native-Playable') === 'true',
    container: res.headers.get('X-Container') ?? 'unknown',
    videoCodec: res.headers.get('X-Video-Codec') ?? 'unknown',
    audioCodec: res.headers.get('X-Audio-Codec') ?? '(none)',
    durationSeconds: Number(res.headers.get('X-Duration-Seconds') ?? 0),
    ffmpegAvailable: res.headers.get('X-Ffmpeg-Available') === 'true',
  }
}

export function streamUrl(scanId: string, path: string): string {
  return `/api/treesize/scans/${scanId}/stream?path=${encodeURIComponent(path)}`
}

export function hlsPlaylistUrl(scanId: string, path: string): string {
  return `/api/treesize/scans/${scanId}/hls/playlist.m3u8?path=${encodeURIComponent(path)}`
}

function probePath(scanId: string, path: string): string {
  return `/treesize/scans/${scanId}/probe?path=${encodeURIComponent(path)}`
}
