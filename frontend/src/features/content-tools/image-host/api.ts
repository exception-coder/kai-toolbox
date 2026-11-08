import { authFetch, http } from '@/lib/api'

export interface HostSettings {
  name: string; provider: 'OSS' | 'S3' | 'GITHUB'; endpoint: string; region: string
  bucket: string; prefix: string; publicBaseUrl: string; repository: string; branch: string; pathStyle: boolean
}
export interface HostProfile { id: string; settings: HostSettings; credentialsConfigured: boolean; isDefault: boolean }
export interface HostSave { settings: HostSettings; accessKey: string; secret: string; makeDefault: boolean; creationId: string }
export interface ImageReceipt { requestId: string; profileId: string; objectKey: string; url: string; fileName: string; state: string; markdown: string }
const base = '/doc-viewer/image-hosts'
export const listImageHosts = () => http<HostProfile[]>(base)
export const recentImages = () => http<ImageReceipt[]>(`${base}/uploads`)
export const saveImageHost = (id: string | null, payload: HostSave) => http<HostProfile>(id ? `${base}/${encodeURIComponent(id)}` : base, {
  method: id ? 'PUT' : 'POST', body: JSON.stringify(payload),
})
export const deleteImageHost = (id: string) => http<void>(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' }, 'empty')
export async function uploadImage(id: string, file: File, requestId: string): Promise<ImageReceipt> {
  const body = new FormData(); body.append('file', file)
  const result = await authFetch(`${base}/${encodeURIComponent(id)}/uploads?requestId=${encodeURIComponent(requestId)}`, { method: 'POST', body })
  if (!result.ok) {
    let message = '上传未确认，请先到图床核对，不要重复上传'
    try { const error = await result.json(); if (typeof error.message === 'string') message = error.message } catch { /* Keep the recoverable message. */ }
    throw new Error(message)
  }
  return result.json()
}
