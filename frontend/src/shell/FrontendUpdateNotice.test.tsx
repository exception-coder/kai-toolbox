import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrontendUpdateNotice, latestFrontendVersion } from './FrontendUpdateNotice'

const context = vi.hoisted(() => ({ active: false, mutations: 0, confirm: vi.fn() }))
vi.mock('@/features/claude-chat/public-api/runtime', () => ({ useChatRuntime: () => ({ active: context.active }) }))
vi.mock('@tanstack/react-query', () => ({ useIsMutating: () => context.mutations }))
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => context.confirm }))
const current = 'a'.repeat(24), next = 'b'.repeat(24)

beforeEach(() => {
  document.head.innerHTML = `<meta name="forge-frontend-version" content="${current}">`
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  context.active = false; context.mutations = 0; context.confirm.mockReset().mockResolvedValue(false)
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ready: true, version: next }), {
    headers: { 'Content-Type': 'application/json' },
  })))
})
afterEach(() => { cleanup(); document.head.innerHTML = ''; vi.useRealTimers(); vi.unstubAllGlobals() })

function fixture(path = '/') {
  const reload = vi.fn()
  render(<MemoryRouter initialEntries={[path]}><FrontendUpdateNotice reload={reload} /></MemoryRouter>)
  return reload
}

describe('production frontend updates', () => {
  it('does not poll development pages or older pages without release metadata', () => {
    document.head.innerHTML = ''; fixture()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a SPA HTML fallback or invalid version instead of suggesting an update', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('<html>development</html>', { headers: { 'Content-Type': 'text/html' } }))
    expect(await latestFrontendVersion()).toBeNull()
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ready: true, version: '<script>' }), { headers: { 'Content-Type': 'application/json' } }))
    expect(await latestFrontendVersion()).toBeNull()
  })

  it('keeps an editing/business page until the user confirms and rechecks availability', async () => {
    const reload = fixture('/tools/fore-consult')
    fireEvent.click(await screen.findByRole('button', { name: '刷新使用新版' }))
    await waitFor(() => expect(context.confirm).toHaveBeenCalledOnce())
    expect(reload).not.toHaveBeenCalled()
    context.confirm.mockResolvedValueOnce(true)
    fireEvent.click(screen.getByRole('button', { name: '刷新使用新版' }))
    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
  })

  it('allows postponing a release without resetting the page', async () => {
    const reload = fixture('/tools/fore-consult')
    fireEvent.click(await screen.findByRole('button', { name: '稍后' }))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reload).not.toHaveBeenCalled()
  })

  it('refreshes a pristine idle home page once', async () => {
    vi.useFakeTimers()
    const reload = fixture()
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(40_000) })
    expect(reload).toHaveBeenCalledOnce()
  })

  it.each(['input', 'chat', 'mutation', 'hidden'] as const)('does not automatically refresh when protected by %s', async reason => {
    vi.useFakeTimers()
    context.active = reason === 'chat'; context.mutations = reason === 'mutation' ? 1 : 0
    if (reason === 'hidden') Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    const reload = fixture()
    let input: HTMLInputElement | undefined
    if (reason === 'input') { input = document.createElement('input'); input.value = 'draft'; document.body.append(input) }
    await act(async () => { await Promise.resolve(); await vi.advanceTimersByTimeAsync(40_000) })
    expect(reload).not.toHaveBeenCalled()
    input?.remove()
  })
})
