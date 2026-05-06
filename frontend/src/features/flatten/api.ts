import { http } from '@/lib/api'
import type {
  DedupeResult,
  DuplicateGroup,
  FlattenScan,
  MovePlanItem,
} from './types'

export function startScan(sourcePath: string, targetPath: string) {
  return http<FlattenScan>('/flatten/scans', {
    method: 'POST',
    body: JSON.stringify({ sourcePath, targetPath }),
  })
}

export function getScan(id: string) {
  return http<FlattenScan>(`/flatten/scans/${id}`)
}

export function listScans() {
  return http<FlattenScan[]>('/flatten/scans')
}

export function getDuplicates(id: string) {
  return http<DuplicateGroup[]>(`/flatten/scans/${id}/duplicates`)
}

export function deleteDuplicates(id: string, keepPaths: string[]) {
  return http<DedupeResult>(`/flatten/scans/${id}/duplicates`, {
    method: 'DELETE',
    body: JSON.stringify({ keepPaths }),
  })
}

export function skipDedupe(id: string) {
  return http<FlattenScan>(`/flatten/scans/${id}/skip-dedupe`, { method: 'POST' })
}

export function getMovePlan(id: string) {
  return http<MovePlanItem[]>(`/flatten/scans/${id}/move-plan`)
}

export function startMove(id: string) {
  return http<FlattenScan>(`/flatten/scans/${id}/move`, { method: 'POST' })
}

export function deleteScan(id: string) {
  return http<void>(`/flatten/scans/${id}`, { method: 'DELETE' })
}
