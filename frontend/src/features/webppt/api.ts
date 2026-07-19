import { http, authFetch, ApiError } from '@/lib/api'
import type { DesignTokenResponse, SamplesResponse, VersionsResponse } from './types'

export function getDesignToken(version = 'latest') {
  return http<DesignTokenResponse>(`/webppt/style/token?version=${encodeURIComponent(version)}`)
}

export function getVersions() {
  return http<VersionsResponse>('/webppt/style/versions')
}

export function getSamples() {
  return http<SamplesResponse>('/webppt/samples')
}

/** 提示词是 text/markdown 原文，不是 JSON，不能走 http()，需自行读取响应体。 */
export async function getPrompt(version = 'latest'): Promise<string> {
  const res = await authFetch(`/webppt/style/prompt?version=${encodeURIComponent(version)}`)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const payload = await res.json()
      if (payload && typeof payload.message === 'string') message = payload.message
    } catch {
      /* 响应体不是 JSON，保留默认 message */
    }
    throw new ApiError(res.status, null, message)
  }
  return res.text()
}

/** reveal.js 样例走静态 GET，直接作为 iframe src 使用即可，无需鉴权头。 */
export function sampleContentUrl(sampleId: string) {
  return `/api/webppt/samples/${encodeURIComponent(sampleId)}/content`
}
