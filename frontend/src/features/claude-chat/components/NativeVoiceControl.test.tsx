import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VoiceEvent, VoiceTransport } from '../lib/nativeVoice'
import { NativeVoiceControl } from './NativeVoiceControl'

const media = vi.hoisted(() => ({ offer: vi.fn(), instances: [] as Array<{ connect: () => void; close: ReturnType<typeof vi.fn> }> }))
vi.mock('../lib/nativeVoice', async importOriginal => ({
  ...await importOriginal<typeof import('../lib/nativeVoice')>(),
  voiceAvailability: () => null,
  NativeVoiceConnection: class {
    close = vi.fn()
    answer = vi.fn().mockResolvedValue(undefined)
    mute = vi.fn()
    offer = media.offer
    constructor(readonly connect: () => void) { media.instances.push(this) }
  },
}))

beforeEach(() => {
  sessionStorage.clear()
  media.instances.length = 0
  media.offer.mockReset().mockResolvedValue('v=0')
})
afterEach(() => { cleanup(); vi.restoreAllMocks() })

function fixture() {
  const listeners = new Set<(event: VoiceEvent) => void>()
  const transport: VoiceTransport = {
    start: vi.fn().mockReturnValue(true), control: vi.fn(),
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  const view = (busy = false, sessionId = 'session-1', connected = true, disabled = false) => (
    <NativeVoiceControl sessionId={sessionId} transport={transport} connected={connected} busy={busy} disabled={disabled} />
  )
  return { transport, view }
}

it('connects immediately while code runs and does not restart when the task finishes', async () => {
  const f = fixture()
  const page = render(f.view(true))
  expect(screen.getByRole('button', { name: '语音对话' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  act(() => media.instances[0].connect())
  expect(screen.getByRole('button', { name: '语音已连接' })).toBeInTheDocument()
  page.rerender(f.view(false))
  expect(f.transport.start).toHaveBeenCalledTimes(1)
})

it('restores the interrupted hint after remount and reconnects on click while code still runs', async () => {
  const f = fixture()
  const beforeRefresh = render(f.view())
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  beforeRefresh.unmount()
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
  render(f.view(true))
  expect(screen.getByRole('button', { name: '恢复语音' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '语音已连接' })).not.toBeInTheDocument()
  expect(f.transport.start).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '恢复语音' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(2))
})

it('explicit hangup clears the saved recovery hint', async () => {
  const f = fixture()
  const first = render(f.view())
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  act(() => media.instances[0].connect())
  fireEvent.click(screen.getByRole('button', { name: '结束通话' }))
  first.unmount()
  render(f.view())
  expect(screen.getByRole('button', { name: '语音对话' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '恢复语音' })).not.toBeInTheDocument()
})

it('cancelling a connecting call prevents a late offer from being dispatched', async () => {
  let resolveOffer!: (sdp: string) => void
  media.offer.mockReturnValue(new Promise<string>(resolve => { resolveOffer = resolve }))
  const f = fixture()
  const page = render(f.view(true))
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  fireEvent.click(screen.getByRole('button', { name: '取消连接' }))
  expect(screen.getByRole('button', { name: '语音对话' })).toHaveFocus()
  page.rerender(f.view(false))
  await act(async () => resolveOffer('v=0'))
  expect(f.transport.start).not.toHaveBeenCalled()
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
})

it('closes old media on session switch and keeps recovery hints isolated', async () => {
  const f = fixture()
  const page = render(f.view(true))
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  page.rerender(f.view(false, 'session-2'))
  expect(screen.getByRole('button', { name: '语音对话' })).toBeInTheDocument()
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
  page.rerender(f.view(false))
  expect(screen.getByRole('button', { name: '恢复语音' })).toBeInTheDocument()
  expect(media.offer).toHaveBeenCalledTimes(1)
})

it('closes media on socket loss and requires another click after reconnection', async () => {
  const f = fixture()
  const page = render(f.view(true))
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  page.rerender(f.view(true, 'session-1', false))
  page.rerender(f.view(false))
  expect(media.offer).toHaveBeenCalledTimes(1)
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '恢复语音' })).toBeEnabled()
})

it('releases audio when the page is hidden without automatically reconnecting', async () => {
  const f = fixture()
  const page = render(f.view(true))
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(f.transport.start).toHaveBeenCalledTimes(1))
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
  fireEvent(document, new Event('visibilitychange'))
  hidden.mockReturnValue(false)
  page.rerender(f.view(false))
  expect(media.offer).toHaveBeenCalledTimes(1)
  expect(media.instances[0].close).toHaveBeenCalledTimes(1)
})

it('shows permission failure with explicit retry and never retries it automatically', async () => {
  media.offer.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
  const f = fixture()
  const page = render(f.view())
  fireEvent.click(screen.getByRole('button', { name: '语音对话' }))
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('麦克风权限被拒绝'))
  page.rerender(f.view())
  expect(media.offer).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '恢复语音' })).toBeEnabled()
  expect(f.transport.start).not.toHaveBeenCalled()
})

it('keeps restricted sessions disabled even when a task is running', () => {
  const f = fixture()
  render(f.view(true, 'session-1', true, true))
  expect(screen.getByRole('button', { name: '语音对话' })).toBeDisabled()
  expect(media.offer).not.toHaveBeenCalled()
})

it('does not start automatically when a session becomes eligible', () => {
  const f = fixture()
  const page = render(f.view(true, 'session-1', true, true))
  page.rerender(f.view(false))
  expect(media.offer).not.toHaveBeenCalled()
})
