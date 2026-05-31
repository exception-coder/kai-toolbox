import type { VideoSizeBucket, VideoSortBy, VideoSortOrder } from './types'

/**
 * localStorage namespace for the video-library page. The {@code :v1} suffix lets us bump the
 * shape later (add/remove fields) without parsing legacy blobs — just bump to {@code :v2}
 * and old entries become inert.
 */
const STORAGE_KEY = 'video-library:state:v1'

export interface PersistedState {
  sortBy: VideoSortBy
  order: VideoSortOrder
  sizeBucket: VideoSizeBucket
  favoritesOnly: boolean
  /** 「按语言筛选」选中的 ISO 码；空串 = 全部语言。 */
  language: string
  /** Absolute path of the last-played video. Used as a hint, not a hard requirement —
   * the page falls back to the first item when the path is no longer in the library. */
  selectedPath: string | null
}

export function loadState(): Partial<PersistedState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as Partial<PersistedState>
  } catch {
    // Storage disabled (incognito strict mode), corrupt JSON, etc. Treat as empty.
    return {}
  }
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Quota or disabled. Persistence is a nice-to-have, not load-bearing.
  }
}
