import { http } from '@/lib/api'
import type { HostPayload, HostView, TestHostResult } from './types'

export function listHosts() {
  return http<HostView[]>('/hosts')
}

export function getHost(id: string) {
  return http<HostView>(`/hosts/${id}`)
}

export function createHost(payload: HostPayload) {
  return http<HostView>('/hosts', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateHost(id: string, payload: HostPayload) {
  return http<HostView>(`/hosts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteHost(id: string) {
  return http<void>(`/hosts/${id}`, { method: 'DELETE' })
}

export function testHostPayload(payload: HostPayload) {
  return http<TestHostResult>('/hosts/test', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function testSavedHost(id: string) {
  return http<TestHostResult>(`/hosts/${id}/test`, { method: 'POST' })
}
