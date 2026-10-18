import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

vi.mock('react', async importOriginal => await importOriginal())
const mocks = vi.hoisted(() => ({ http: vi.fn(), user: { userId: 1 } }))
vi.mock('@/lib/api', () => ({ http: mocks.http }))
vi.mock('@/lib/auth', () => ({ getUser: () => mocks.user, useAuth: () => ({ user: mocks.user }) }))
vi.mock('./featureRegistry', () => ({ features: [
  { id: 'hosts' }, { id: 'frp-config' }, { id: 'docker', defaultVisible: false },
] }))

beforeEach(() => {
  vi.resetModules()
  Reflect.deleteProperty(globalThis, '__forgeMenuVisibilityStore')
  localStorage.clear()
  mocks.http.mockReset().mockResolvedValue({ visibleIds: null })
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

it('keeps settings, sidebar and home subscribers in sync across separately evaluated modules', async () => {
  const sidebar = await import('./menuVisibility')
  const first = renderHook(() => sidebar.useVisibleIds())
  vi.resetModules()
  const settings = await import('./menuVisibility')
  const second = renderHook(() => settings.useVisibleIds())
  act(() => settings.setMenuVisible('hosts', false))
  expect(first.result.current).not.toContain('hosts')
  expect(second.result.current).toEqual(first.result.current)
  act(() => sidebar.setMenuVisible('hosts', true))
  expect(second.result.current).toContain('hosts')
})

it('applies changes and reset even when local storage cannot be written', async () => {
  const menu = await import('./menuVisibility')
  const state = renderHook(() => menu.useVisibleIds())
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  act(() => menu.setMenuVisible('docker', true))
  expect(state.result.current).toContain('docker')
  act(() => menu.resetMenuVisibility())
  expect(state.result.current).not.toContain('docker')
})

it('does not replace a new user choice with an older hydration response', async () => {
  let resolve!: (value: unknown) => void
  mocks.http.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const menu = await import('./menuVisibility')
  const state = renderHook(() => { menu.useMenuVisibilitySync(); return menu.useVisibleIds() })
  act(() => menu.setMenuVisible('docker', true))
  await act(async () => { resolve({ visibleIds: ['hosts'] }) })
  expect(state.result.current).toContain('docker')
})
