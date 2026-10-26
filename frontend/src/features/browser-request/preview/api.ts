import { http } from '@/lib/api'
import { ensureFreshToken, getToken } from '@/lib/auth'

export interface PreviewTarget {
  requestKey: string; origin: string; route: string; device: 'phone' | 'desktop'
  scene: 'page' | 'consult-image'; resourceId?: string; loginPage?: string
  readySelector?: string; sourceRevision?: string; productionConfirmed?: boolean
}
export interface PreviewView {
  id: string; status: string; target: PreviewTarget; targetOrigin: string; account: string; environment: string; runtimeVersion: string; expiresAt: number; viewerPath: string
}
export interface PreviewResource { id: string; name: string; environment: string; username: string; baseUrl?: string }
export const createPreview = (target: PreviewTarget) => http<PreviewView>('/page-previews', { method: 'POST', body: JSON.stringify(target) })
export const getPreview = (id: string) => http<PreviewView>(`/page-previews/${encodeURIComponent(id)}`)
export const closePreview = (id: string) => http<void>(`/page-previews/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'empty')
export const continuePreview = (id: string) => http<PreviewView>(`/page-previews/${encodeURIComponent(id)}/resume`, { method: 'POST' })
export const previewResources = () => http<PreviewResource[]>('/page-previews/resources')
export const previewInput = (id: string, input: object) => http<void>(`/page-previews/${encodeURIComponent(id)}/input`, { method: 'POST', body: JSON.stringify(input) }, 'empty')
export async function previewFrame(id: string, signal: AbortSignal) {
  await ensureFreshToken()
  const response = await fetch(`/api/page-previews/${encodeURIComponent(id)}/screenshot`, {
    headers: { Authorization: `Bearer ${getToken() ?? ''}` }, cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  })
  if (!response.ok) throw new Error(`画面读取失败（HTTP ${response.status}）`)
  return response.blob()
}
