import { http } from '@/lib/api'
import type { MailDetail, MailListResponse, MailStats } from './types'

export interface MailListParams {
  page?: number
  size?: number
  toAddress?: string
  isRead?: boolean
  keyword?: string
}

export function listInbox(params: MailListParams = {}) {
  const qs = new URLSearchParams()
  if (params.page != null) qs.set('page', String(params.page))
  if (params.size != null) qs.set('size', String(params.size))
  if (params.toAddress) qs.set('toAddress', params.toAddress)
  if (params.isRead != null) qs.set('isRead', String(params.isRead))
  if (params.keyword) qs.set('keyword', params.keyword)
  const query = qs.toString()
  return http<MailListResponse>(`/mail/inbox${query ? '?' + query : ''}`)
}

export function getMailDetail(id: string) {
  return http<MailDetail>(`/mail/inbox/${id}`)
}

export function deleteMail(id: string) {
  return http<{ success: boolean }>(`/mail/inbox/${id}`, { method: 'DELETE' })
}

export function getStats() {
  return http<MailStats>('/mail/stats')
}
