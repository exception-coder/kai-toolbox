import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { closePreview, createPreview, previewInput } from './api'
import { emitSessionExpired, ensureFreshToken } from '@/lib/auth'

vi.mock('@/lib/auth', () => ({ ensureFreshToken: vi.fn(), emitSessionExpired: vi.fn(), getToken: () => 'fixture' }))
vi.mock('@/lib/mock/mode', () => ({ isMockEnabled: () => false }))
const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => { localStorage.setItem('toolbox.auth.token', 'fixture'); vi.stubGlobal('fetch', fetchMock) })
afterEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.clearAllMocks(); vi.unstubAllGlobals() })

it.each([200, 204])('accepts HTTP %s empty responses when closing a preview or sending an input', async status => {
  fetchMock.mockImplementation(async () => new Response(null, { status }))
  await expect(closePreview('preview-1')).resolves.toBeUndefined()
  await expect(previewInput('preview-1', { type: 'key', key: 'Enter' })).resolves.toBeUndefined()
  expect(ensureFreshToken).toHaveBeenCalledTimes(2)
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'DELETE', headers: { Authorization: 'Bearer fixture' } })
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ type: 'key', key: 'Enter' }) })
})

it('preserves server errors instead of treating a failed close as success', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: '不能操作他人预览' }), { status: 403 }))
  await expect(closePreview('preview-1')).rejects.toThrow('不能操作他人预览')
})

it('preserves expired-login handling for bodyless commands', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 401 }))
  await expect(closePreview('preview-1')).rejects.toThrow('HTTP 401')
  expect(emitSessionExpired).toHaveBeenCalledOnce()
})

it('still requires valid JSON for preview creation', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
  await expect(createPreview({ requestKey: 'fixture', origin: 'https://forge.test', route: '/tools/fore-consult', device: 'desktop', scene: 'page' })).rejects.toBeInstanceOf(SyntaxError)
})
