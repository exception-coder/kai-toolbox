import { http, ApiError } from '@/lib/api'
import type { CleanJunkResult, SubtitleJob, VideoLibraryPage, VideoSizeBucket, VideoSortBy, VideoSortOrder } from './types'

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

export function thumbUrl(scanId: string, path: string): string {
  return `/api/treesize/scans/${scanId}/thumb?path=${encodeURIComponent(path)}`
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

export function createSubtitleJob(scanId: string, path: string, language = 'auto') {
  return http<SubtitleJob>(
    `/treesize/subtitles/jobs?scanId=${encodeURIComponent(scanId)}&path=${encodeURIComponent(path)}&language=${encodeURIComponent(language)}`,
    { method: 'POST' },
  )
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
