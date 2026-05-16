export interface VideoLibraryItem {
  scanId: string
  rootPath: string
  path: string
  name: string
  size: number
  favorited: boolean
}

export interface VideoLibraryPage {
  items: VideoLibraryItem[]
  total: number
  offset: number
  limit: number
}

export interface CleanJunkResult {
  deleted: number
  skipped: number
  errors: string[]
}

export type VideoSortBy = 'name' | 'size'
export type VideoSortOrder = 'asc' | 'desc'

/**
 * Coarse size buckets the library can be filtered by. Values are sent verbatim as the
 * {@code sizeBucket} query param; the backend {@code VideoSizeBucket.parse} is lenient and
 * falls back to {@code all} on unknowns.
 */
export type VideoSizeBucket =
  | 'all'
  | 'tiny'    // < 100 MB
  | 'small'   // 100 MB – 500 MB
  | 'medium'  // 500 MB – 1 GB
  | 'large'   // 1 GB – 4 GB
  | 'xlarge'  // 4 GB – 10 GB
  | 'huge'    // > 10 GB

export const VIDEO_SIZE_BUCKETS: { value: VideoSizeBucket; label: string }[] = [
  { value: 'all',    label: '全部大小' },
  { value: 'tiny',   label: '< 100 MB' },
  { value: 'small',  label: '100 MB – 500 MB' },
  { value: 'medium', label: '500 MB – 1 GB' },
  { value: 'large',  label: '1 GB – 4 GB' },
  { value: 'xlarge', label: '4 GB – 10 GB' },
  { value: 'huge',   label: '> 10 GB' },
]

/** Mirrors the backend SubtitleStatus enum exactly. */
export type SubtitleStatus =
  | 'PENDING'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export interface SegmentStat {
  idx: number
  file: string
  /** {@code prewarm} = served from the in-memory segment cache populated when the playlist was fetched. */
  mode: 'copy' | 'transcode' | 'prewarm'
  spawnMs: number
  firstByteMs: number
  totalMs: number
  bytesOut: number
  aborted: boolean
  at: number
}

export interface PlaybackStats {
  activeFfmpeg: number
  recentSegments: SegmentStat[]
  /** Runtime A/B toggle: {@code true} = hwaccel + prewarm; {@code false} = pure-software baseline. */
  optimizationEnabled: boolean
}

/** One entry of the "最近访问" rail. {@code item} carries the same fields as a library row. */
export interface RecentVideo {
  item: VideoLibraryItem
  /** Epoch ms of the last time this video's HLS playlist or raw stream was requested. */
  lastAccessAt: number
}

export interface SubtitleJob {
  id: string
  scanId: string
  videoPath: string
  status: SubtitleStatus
  model: string
  /** ISO 639-1 / -3 code that whisper auto-detected; empty until transcription has begun. */
  sourceLanguage: string | null
  /** 0.0 → 1.0. */
  progress: number
  hasVtt: boolean
  /** True when the server-side DeepLX translation has completed. Available for all browsers. */
  hasTranslatedVtt: boolean
  errorMsg: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}
