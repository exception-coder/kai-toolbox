import { http } from '@/lib/api'
import type {
  AddTorrentRequest,
  AddUriRequest,
  AddUriResponse,
  HealthResponse,
  MagnetTaskView,
} from '../types'

const BASE = '/magnet'

export const magnetApi = {
  health() {
    return http<HealthResponse>(`${BASE}/health`)
  },

  list(limit = 100) {
    return http<MagnetTaskView[]>(`${BASE}/tasks?limit=${limit}`)
  },

  get(gid: string) {
    return http<MagnetTaskView>(`${BASE}/tasks/${gid}`)
  },

  addUri(req: AddUriRequest) {
    return http<AddUriResponse>(`${BASE}/tasks`, {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  addTorrent(req: AddTorrentRequest) {
    return http<{ gid: string }>(`${BASE}/tasks/torrent`, {
      method: 'POST',
      body: JSON.stringify(req),
    })
  },

  pause(gid: string) {
    return http<void>(`${BASE}/tasks/${gid}/pause`, { method: 'POST' })
  },

  resume(gid: string) {
    return http<void>(`${BASE}/tasks/${gid}/resume`, { method: 'POST' })
  },

  remove(gid: string) {
    return http<void>(`${BASE}/tasks/${gid}`, { method: 'DELETE' })
  },
}
