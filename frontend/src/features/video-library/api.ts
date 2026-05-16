import { http, ApiError } from '@/lib/api'
import type { CleanJunkResult, PlaybackStats, RecentVideo, SubtitleJob, VideoLibraryPage, VideoSizeBucket, VideoSortBy, VideoSortOrder } from './types'

export function getVideoLibrary(
  sortBy: VideoSortBy,
  order: VideoSortOrder,
  sizeBucket: VideoSizeBucket,
  q: string,
  favoritesOnly: boolean,
  offset: number,
  limit: number,
) {
  const params = new URLSearchParams({
    sortBy,
    order,
    sizeBucket,
    favoritesOnly: String(favoritesOnly),
    offset: String(offset),
    limit: String(limit),
  })
  if (q.trim()) params.set('q', q.trim())
  return http<VideoLibraryPage>(`/treesize/videos?${params.toString()}`)
}

export function cleanJunkVideos() {
  return http<CleanJunkResult>(`/treesize/videos/junk`, { method: 'DELETE' })
}

export function addVideoFavorite(path: string) {
  return http<void>(`/treesize/videos/favorites?path=${encodeURIComponent(path)}`, { method: 'POST' })
}

export function removeVideoFavorite(path: string) {
  return http<void>(`/treesize/videos/favorites?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
}

export function getRecentVideos(limit = 10) {
  return http<RecentVideo[]>(`/treesize/videos/recent?limit=${limit}`)
}

export function thumbUrl(scanId: string, path: string): string {
  return `/api/treesize/scans/${scanId}/thumb?path=${encodeURIComponent(path)}`
}

export function getPlaybackStats() {
  return http<PlaybackStats>(`/treesize/playback-stats`)
}

export function setHlsOptimization(enabled: boolean) {
  return http<void>(`/treesize/hls/optimization?enabled=${enabled}`, { method: 'POST' })
}

// ---------- subtitles ----------------------------------------------------

/**
 * Look up an existing subtitle job for a given video. Returns {@code null} when the backend
 * has no record (404), and surfaces other errors. The frontend uses the returned status to
 * decide whether to render "生成字幕" / "生成中" / "已生成".
 */
export async function getSubtitleByVideo(scanId: string, path: string): Promise<SubtitleJob | null> {
  try {
    return await http<SubtitleJob>(
      `/treesize/subtitles/by-video?scanId=${encodeURIComponent(scanId)}&path=${encodeURIComponent(path)}`,
    )
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null
    throw e
  }
}

export function createSubtitleJob(scanId: string, path: string, language = 'auto', prompt?: string) {
  const params = new URLSearchParams({
    scanId,
    path,
    language,
  })
  // Only send the prompt parameter when there's a non-empty value — the backend treats null
  // and the empty string the same way (fall back to default-initial-prompt), so omitting it
  // entirely keeps URLs tidier.
  if (prompt && prompt.trim().length > 0) params.set('prompt', prompt.trim())
  return http<SubtitleJob>(`/treesize/subtitles/jobs?${params.toString()}`, { method: 'POST' })
}

export function getSubtitleJob(jobId: string) {
  return http<SubtitleJob>(`/treesize/subtitles/jobs/${jobId}`)
}

export function cancelSubtitleJob(jobId: string) {
  return http<void>(`/treesize/subtitles/jobs/${jobId}/cancel`, { method: 'POST' })
}

export function translateSubtitleJob(jobId: string) {
  return http<void>(`/treesize/subtitles/jobs/${jobId}/translate`, { method: 'POST' })
}

export function deleteSubtitleJob(jobId: string) {
  return http<void>(`/treesize/subtitles/jobs/${jobId}`, { method: 'DELETE' })
}

/** SSE path (under /api). Subscribe via {@code subscribeSse}. */
export function subtitleEventsPath(jobId: string): string {
  return `/treesize/subtitles/jobs/${jobId}/events`
}

/** Absolute URL the {@code <track src>} attribute consumes (original language). */
export function subtitleVttUrl(jobId: string): string {
  return `/api/treesize/subtitles/jobs/${jobId}/vtt`
}

/** Absolute URL for the server-translated (Chinese) VTT. Works on all browsers incl. mobile. */
export function subtitleTranslatedVttUrl(jobId: string): string {
  return `/api/treesize/subtitles/jobs/${jobId}/vtt/translated`
}
