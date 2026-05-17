import { http } from '@/lib/api'
import type {
  CaptureStatusView, ExecuteRequestBody, ExecutedResponse, SaveRequestBody, SavedRequestView,
  SessionView,
} from './types'

export function listSessions() {
  return http<SessionView[]>('/browser-request/sessions')
}

export function createSession(name: string, url: string) {
  return http<SessionView>('/browser-request/sessions', {
    method: 'POST',
    body: JSON.stringify({ name, url }),
  })
}

export function openSession(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/open`, { method: 'POST' })
}

export function saveStorage(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/save`, { method: 'POST' })
}

export function clearStorage(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/clear`, { method: 'POST' })
}

export function closeSession(id: string) {
  return http<SessionView>(`/browser-request/sessions/${id}/close`, { method: 'POST' })
}

export function deleteSession(id: string) {
  return http<void>(`/browser-request/sessions/${id}`, { method: 'DELETE' })
}

export function executeRequest(id: string, body: ExecuteRequestBody) {
  return http<ExecutedResponse>(`/browser-request/sessions/${id}/execute`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

// ── 收藏的请求 ───────────────────────────────────────────────────────────────

export function listSavedRequests(sessionId: string) {
  return http<SavedRequestView[]>(`/browser-request/sessions/${sessionId}/saved`)
}

export function saveRequest(sessionId: string, body: SaveRequestBody) {
  return http<SavedRequestView>(`/browser-request/sessions/${sessionId}/saved`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateSavedRequest(savedId: string, body: SaveRequestBody) {
  return http<SavedRequestView>(`/browser-request/saved/${savedId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function deleteSavedRequest(savedId: string) {
  return http<void>(`/browser-request/saved/${savedId}`, { method: 'DELETE' })
}

// ── JS 捕获 ──────────────────────────────────────────────────────────────────

export function captureStatus(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture`)
}

export function startCapture(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture/start`, {
    method: 'POST',
  })
}

export function stopCapture(sessionId: string) {
  return http<CaptureStatusView>(`/browser-request/sessions/${sessionId}/capture/stop`, {
    method: 'POST',
  })
}
