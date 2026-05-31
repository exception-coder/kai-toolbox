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

/**
 * Trigger (or re-run) Ollama 翻译生成中文 .zh.vtt。
 * 传 model 时后端会先删旧 .zh.vtt 再用新模型重跑;不传 = 用 yml 默认 ollama-model,
 * 已有译文时直接返回 204 不重跑。
 */
export function translateSubtitleJob(jobId: string, model?: string) {
  const qs = model && model.trim() ? `?model=${encodeURIComponent(model.trim())}` : ''
  return http<void>(`/treesize/subtitles/jobs/${jobId}/translate${qs}`, { method: 'POST' })
}

export interface OllamaModel {
  name: string
  sizeBytes: number
  modifiedAt: string
}

export interface OllamaModelsView {
  models: OllamaModel[]
  /** 后端 yml 配的默认模型;前端 localStorage 没存用户偏好时回退到这个。 */
  defaultModel: string
}

/** 拉一次 Ollama 本地安装的模型清单。Ollama 没起 / 网不通时后端返回空数组 + defaultModel。 */
export function getOllamaModels() {
  return http<OllamaModelsView>(`/treesize/ollama/models`)
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

// =============================================================================
// 视频处理任务（视频表数据加工）
// 与后端 VideoProcessingController + VideoProcessingJobService 对齐：
// - 同步：阻塞执行，直接返回计数
// - 其它任务（duration-probe / name-grouping / 未来 6 类）统一 4 端点契约
// =============================================================================

/** 视频表同步结果。POST /videos/sync 同步返回。 */
export interface VideoSyncResult {
  scannedFromNode: number
  insertedNew: number
  skippedExisting: number
  skippedTooSmall: number
  elapsedMs: number
}

export function syncVideoLibrary() {
  return http<VideoSyncResult>('/treesize/videos/sync', { method: 'POST' })
}

/** 视频合并结果。POST /videos/merge 同步返回。 */
export interface VideoMergeResult {
  outputPath: string
  inputCount: number
  mergedCount: number
  skippedCount: number
  outputBytes: number
  reencoded: boolean
  elapsedMs: number
}

/**
 * 合并多选的视频（按数组顺序拼接）。reencode：auto=能无损 copy 就 copy 否则重编码，
 * copy=强制无损，force=强制重编码统一格式。默认 auto。
 */
export function mergeVideos(paths: string[], reencode: 'auto' | 'copy' | 'force' = 'auto') {
  return http<VideoMergeResult>('/treesize/videos/merge', {
    method: 'POST',
    body: JSON.stringify({ paths, reencode }),
  })
}

/** 视频处理任务类型枚举（与后端 ProcessingJobType 严格对齐）。 */
export type ProcessingJobType =
  | 'LANGUAGE_DETECT'
  | 'THUMBNAIL_GRID'
  | 'DURATION_PROBE'
  | 'NAME_GROUPING'
  | 'PERSON_AGE_DETECT'
  | 'VISUAL_EMBED'
  | 'VISUAL_CLUSTER'

/** 后端 video_processing_job 行的 view。 */
export interface ProcessingJob {
  id: string
  type: ProcessingJobType
  status: 'RUNNING' | 'DONE' | 'FAILED' | 'CANCELLED'
  total: number
  processed: number
  succeeded: number
  failed: number
  currentPath: string | null
  errorMsg: string | null
  startedAt: number
  finishedAt: number | null
}

/** start 端点的响应：200 含 jobId/total；409 含已运行的 jobId + message。 */
export interface StartTaskResponse {
  jobId: string
  total: number
}

/**
 * 启动一类任务。后端原子检查：同 type 已有 RUNNING 时返回 409。
 * 调用方可 catch ApiError 拿 status===409 时降级到"查看进度"。
 */
function buildTaskApi(slug: string) {
  return {
    start: () => http<StartTaskResponse>(`/treesize/videos/${slug}/start`, { method: 'POST' }),
    stop: () => http<void>(`/treesize/videos/${slug}/stop`, { method: 'POST' }),
    status: () => http<ProcessingJob | null>(`/treesize/videos/${slug}/status`),
    eventsPath: () => `/treesize/videos/${slug}/events`,
  }
}

export const durationProbeApi = buildTaskApi('duration-probe')
export const nameGroupingApi = buildTaskApi('name-grouping')
export const languageDetectApi = buildTaskApi('language-detect')
export const thumbnailGridApi = buildTaskApi('thumbnail-grid')
// 下期上：personAgeApi / visualEmbedApi / visualClusterApi

/**
 * 视频九宫格 JPEG 的绝对 URL，供 {@code <img src>} 直接拼。
 * 后端 GET 端点会 304 缓存 1 天；未生成 / 缓存被删 → 404。
 */
export function thumbnailGridUrl(path: string): string {
  return `/api/treesize/videos/thumbnail-grid?path=${encodeURIComponent(path)}`
}

/** 按系列签名查同系列视频（前端展示"同系列(N)"链接时用）。 */
export interface VideoSeriesItem {
  path: string
  name: string
  size: number
  episode: number | null
  thumbnailGridPath: string | null
}
export interface VideoSeriesView {
  signature: string
  count: number
  items: VideoSeriesItem[]
}

export function getVideoSeries(signature: string) {
  return http<VideoSeriesView>(`/treesize/videos/series/${encodeURIComponent(signature)}`)
}
