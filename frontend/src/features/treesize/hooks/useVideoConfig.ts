import { useQuery } from '@tanstack/react-query'
import { getVideoConfig } from '../api'
import type { VideoConfig } from '../types'

const EMPTY: VideoConfig = { videoExtensions: [], ffmpegAvailable: false }

/**
 * Pulls the backend's video extension whitelist + ffmpeg availability once and caches it long.
 * Returns a stable empty value while loading so callers can use it unconditionally.
 */
export function useVideoConfig(): VideoConfig {
  const { data } = useQuery({
    queryKey: ['treesize-video-config'],
    queryFn: getVideoConfig,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  })
  return data ?? EMPTY
}
