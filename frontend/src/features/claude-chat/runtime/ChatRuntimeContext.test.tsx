import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { memo, useEffect, useLayoutEffect } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ChatRuntimeProvider, useChatRuntime } from './ChatRuntimeContext'

const track = vi.hoisted(() => {
  let finish!: () => void
  return { loads: 0, engineMounts: 0, pageMounts: 0, gate: new Promise<void>(resolve => { finish = resolve }), finish: () => finish() }
})
vi.mock('@/shell/permission', () => ({ useAccessContext: () => ({ superAdmin: true, roles: [], permissionCodes: [] }) }))
vi.mock('@/lib/vibeEntryDiagnostics', () => ({ reportVibeEntry: vi.fn() }))
vi.mock('../hooks/useGrabGesture', () => ({ useGrabGesture: vi.fn() }))
vi.mock('../components/GestureFlourish', () => ({ GestureFlourish: () => null }))
vi.mock('./ChatRuntimeEngine', async () => {
  track.loads++
  await track.gate
  const chat = { sessionId: 'retained-session' }
  return { ChatRuntimeEngine: memo(({ onChat }: { onChat: (value: unknown) => void }) => {
    useEffect(() => { track.engineMounts++ }, [])
    useLayoutEffect(() => { onChat(chat) }, [onChat])
    return null
  }) }
})
afterEach(() => { cleanup(); localStorage.clear() })

function Workspace() {
  const runtime = useChatRuntime()
  const navigate = useNavigate()
  useEffect(() => { track.pageMounts++ }, [])
  return <>
    <input aria-label="业务草稿" defaultValue="" />
    <p>{runtime.chat?.sessionId ?? '菜单已可用'}</p>
    <button onClick={runtime.activate}>打开引擎</button>
    <button onClick={() => navigate('/tools/claude-chat')}>对话</button>
    <button onClick={() => navigate('/')}>首页</button>
  </>
}

it('renders navigation before engine download, preserving drafts and one engine across activation and routes', async () => {
  localStorage.clear()
  render(<MemoryRouter><ChatRuntimeProvider><Workspace /></ChatRuntimeProvider></MemoryRouter>)
  expect(screen.getByText('菜单已可用')).toBeVisible()
  expect(track.loads).toBe(0)
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '不应丢失的草稿' } })
  fireEvent.click(screen.getByRole('button', { name: '打开引擎' }))
  expect(screen.getByRole('textbox')).toHaveValue('不应丢失的草稿')
  await act(async () => { track.finish(); await track.gate })
  expect(await screen.findByText('retained-session')).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '对话' }))
  fireEvent.click(screen.getByRole('button', { name: '首页' }))
  expect(screen.getByRole('textbox')).toHaveValue('不应丢失的草稿')
  expect(track.pageMounts).toBe(1)
  expect(track.engineMounts).toBe(1)
  expect(track.loads).toBe(1)
})
