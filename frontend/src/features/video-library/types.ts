export interface VideoLibraryItem {
  scanId: string
  rootPath: string
  path: string
  name: string
  size: number
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

/** Mirrors the backend SubtitleStatus enum exactly. */
export type SubtitleStatus =
  | 'PENDING'
  | 'EXTRACTING_AUDIO'
  | 'TRANSCRIBING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

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
