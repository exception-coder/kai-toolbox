import { MockHttpError, registerHttp } from '@/lib/mock/registry'
import type { HostPayload, HostView } from './types'

/** 进程内单例：所有 /hosts 路由共享同一份内存表，刷新页面才丢。 */
const HOSTS: HostView[] = []

function uid(): string {
  return 'mock-' + Math.random().toString(36).slice(2, 10)
}

function toView(payload: HostPayload, existing?: HostView): HostView {
  const now = Date.now()
  return {
    id: existing?.id ?? uid(),
    name: payload.name.trim(),
    host: payload.host.trim(),
    port: payload.port || 22,
    username: payload.username.trim(),
    authType: payload.authType,
    privateKey: payload.authType === 'KEY' ? (payload.privateKey ?? null) : null,
    passwordConfigured:
      payload.authType === 'PASSWORD' && Boolean(payload.password?.trim() || existing?.passwordConfigured),
    passphraseConfigured:
      payload.authType === 'KEY' && Boolean(payload.passphrase?.trim() || existing?.passphraseConfigured),
    tag: payload.tag?.trim() || null,
    note: payload.note?.trim() || null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    label: `${payload.username}@${payload.host}:${payload.port || 22}`,
  }
}

registerHttp('GET', '/hosts', () => {
  return [...HOSTS].sort((a, b) => b.updatedAt - a.updatedAt)
})

registerHttp('GET', '/hosts/:id', ({ params }) => {
  const found = HOSTS.find(h => h.id === params.id)
  if (!found) throw new MockHttpError(404, 'host not found')
  return found
})

registerHttp('POST', '/hosts', ({ body }) => {
  const payload = body as HostPayload
  const view = toView(payload)
  HOSTS.push(view)
  return view
})

registerHttp('PUT', '/hosts/:id', ({ params, body }) => {
  const idx = HOSTS.findIndex(h => h.id === params.id)
  if (idx < 0) throw new MockHttpError(404, 'host not found')
  const next = toView(body as HostPayload, HOSTS[idx])
  HOSTS[idx] = next
  return next
})

registerHttp('DELETE', '/hosts/:id', ({ params }) => {
  const idx = HOSTS.findIndex(h => h.id === params.id)
  if (idx >= 0) HOSTS.splice(idx, 1)
  return undefined
})

registerHttp('POST', '/hosts/test', () => {
  return { ok: true, message: '[mock] connected' }
})

registerHttp('POST', '/hosts/:id/test', ({ params }) => {
  const found = HOSTS.find(h => h.id === params.id)
  if (!found) throw new MockHttpError(404, 'host not found')
  return { ok: true, message: `[mock] connected to ${found.label}` }
})
