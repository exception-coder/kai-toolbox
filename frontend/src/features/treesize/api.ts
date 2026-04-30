import { http } from '@/lib/api'
import type { NodeView, ScanView } from './types'

export function startScan(path: string) {
  return http<ScanView>('/treesize/scans', {
    method: 'POST',
    body: JSON.stringify({ path }),
  })
}

export function getScan(id: string) {
  return http<ScanView>(`/treesize/scans/${id}`)
}

export function listScans() {
  return http<ScanView[]>('/treesize/scans')
}

export function getChildren(scanId: string, path?: string) {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ''
  return http<NodeView[]>(`/treesize/scans/${scanId}/children${qs}`)
}

export function deleteScan(id: string) {
  return http<void>(`/treesize/scans/${id}`, { method: 'DELETE' })
}
