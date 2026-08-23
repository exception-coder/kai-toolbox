import { http, ApiError } from '@/lib/api'
import { withAuthToken } from '@/lib/auth'
import type { CleanJunkResult, PlaybackStats, RecentVideo, SubtitleJob, VideoDirectoryFacet, VideoLanguageFacet, VideoLibraryPage, VideoSizeBucket, VideoSortBy, VideoSortOrder } from './types'

export function getVideoLibrary(
  sortBy: VideoSortBy,
  order: VideoSortOrder,
  sizeBucket: VideoSizeBucket,
  q: string,
  favoritesOnly: boolean,
  language: string,
  excludeDirs: string[],
  /** 目录作用域：只看该目录及其子目录下的视频；空串 = 不限目录。 */
  dir: string,
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
  // 语言筛选：空 = 全部语言，不传参
  if (language.trim()) params.set('language', language.trim())
  // 目录筛选：空 = 全部目录，不传参
  if (dir.trim()) params.set('dir', dir.trim())
  // 排除目录关键词展开成可重复的 excludeDir 参数,后端按 List<String> 绑定
  for (const excluded of excludeDirs) {
    const trimmed = excluded.trim()
    if (trimmed) params.append('excludeDir', trimmed)
  }
  return http<VideoLibraryPage>(`/treesize/videos?${params.toString()}`)
}

/**
 * 含视频的目录清单（扁平，带直属视频数）。排除目录关键词与列表接口同参，
 * 保证目录树上的计数与点进去看到的条数口径一致。
 */
export function getVideoDirectories(excludeDirs: string[]) {
  const params = new URLSearchParams()
  for (const excluded of excludeDirs) {
    const trimmed = excluded.trim()
    if (trimmed) params.append('excludeDir', trimmed)
  }
  const qs = params.toString()
  return http<VideoDirectoryFacet[]>(`/treesize/videos/directories${qs ? `?${qs}` : ''}`)
}

// ---------- 公开分享链接 --------------------------------------------------

/** 一条分享凭证（签发者视角，含真实路径）。 */
export interface VideoShareRecord {
  token: string
  scanId: string
  path: string
  name: string
  size: number
  createdAt: number
  expiresAt: number
  revoked: boolean
  expired: boolean
  hitCount: number
  lastAccessAt: number | null
}

/** 为一个视频签发公开链接。后端对同一视频已有有效分享时会复用，不会堆记录。 */
export function createVideoShare(item: { scanId: string; path: string; name: string; size: number }, ttlDays = 7) {
  const params = new URLSearchParams({
    scanId: item.scanId,
    path: item.path,
    name: item.name,
    size: String(item.size),
    ttlDays: String(ttlDays),
  })
  return http<VideoShareRecord>(`/treesize/videos/shares?${params.toString()}`, { method: 'POST' })
}

export function listVideoShares(limit = 50) {
  return http<VideoShareRecord[]>(`/treesize/videos/shares?limit=${limit}`)
}

export function revokeVideoShare(token: string) {
  return http<void>(`/treesize/videos/shares/${encodeURIComponent(token)}`, { method: 'DELETE' })
}

/**
 * 分享链接的绝对地址。
 *
 * 用 {@code window.location.origin} 而不是后端配置：工作台自己不知道有没有挂公网隧道，
 * 但「用户此刻是从哪个地址访问的」就是最准的答案 —— 从 trycloudflare 地址打开工作台，
 * 生成的就是公网链接；从内网 IP 打开，生成的就是内网链接（自己设备间传看）。
 */
export function videoShareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`
}

/** 已识别语言清单（语言 ISO + 计数），供「按语言筛选」下拉。 */
export function getVideoLanguages() {
  return http<VideoLanguageFacet[]>(`/treesize/videos/languages`)
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
  return withAuthToken(`/api/treesize/scans/${scanId}/thumb?path=${encodeURIComponent(path)}`)
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
  return withAuthToken(`/api/treesize/subtitles/jobs/${jobId}/vtt`)
}

/** Absolute URL for the server-translated (Chinese) VTT. Works on all browsers incl. mobile. */
export function subtitleTranslatedVttUrl(jobId: string): string {
  return withAuthToken(`/api/treesize/subtitles/jobs/${jobId}/vtt/translated`)
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

export interface VideoScanRoot {
  id: string
  path: string
  enabled: boolean
  lastScanAt: number | null
  videoCount: number
  totalSize: number
  status: 'IDLE' | 'RUNNING' | 'DONE' | 'FAILED'
  errorMessage: string | null
}

export function getVideoScanRoots() {
  return http<VideoScanRoot[]>('/treesize/videos/scan-roots')
}

export function addVideoScanRoot(path: string) {
  return http<VideoScanRoot>('/treesize/videos/scan-roots', {
    method: 'POST', body: JSON.stringify({ path }),
  })
}

export function startVideoDirectoryScan() {
  return http<{ started: boolean; running: boolean }>('/treesize/videos/directory-scan/start', { method: 'POST' })
}

export function getVideoDirectoryScanStatus() {
  return http<{ running: boolean }>('/treesize/videos/directory-scan/status')
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

/**
 * 各处理任务在整个视频表上的累计进度（已完成 = 总数 - 待处理，含成功+已尝试失败）。
 * 进度按钮用它显示「已完成/总数」，避免每次只看到单次 job 从 0 开始。
 */
export interface ProcessingOverview {
  total: number
  durationDone: number
  nameGroupingDone: number
  languageDone: number
  gridDone: number
}

export function getProcessingOverview() {
  return http<ProcessingOverview>('/treesize/videos/processing-overview')
}

/**
 * whisper 后端能力。两种模式（cli / asr-service）能力不等价，用它在点击前禁掉干不了的按钮。
 * `languageDetectBlockedReason` 非空即不可用，文案与后端 503 同源 —— 前端不按 mode 自己推理。
 */
export interface WhisperCapability {
  mode: string
  subtitleAvailable: boolean
  /** 非空 = 不可用，值即展示给用户的原因；不再另给一个布尔位，免得两者对不上。 */
  languageDetectBlockedReason: string | null
}

export function getWhisperCapability() {
  return http<WhisperCapability>('/treesize/videos/whisper-capability')
}
// 下期上：personAgeApi / visualEmbedApi / visualClusterApi

/**
 * 视频九宫格 JPEG 的绝对 URL，供 {@code <img src>} 直接拼。
 * 后端 GET 端点会 304 缓存 1 天；未生成 / 缓存被删 → 404。
 */
export function thumbnailGridUrl(path: string): string {
  return withAuthToken(`/api/treesize/videos/thumbnail-grid?path=${encodeURIComponent(path)}`)
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
