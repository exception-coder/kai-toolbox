import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionClientPage } from './SessionClientPage'

const connect = vi.fn()
const loadHistory = vi.fn()
const destroy = vi.fn()

vi.mock('@/session-client-sdk', () => ({
  createSessionClient: () => ({
    connect,
    loadHistory,
    send: vi.fn(),
    answerQuestion: vi.fn(),
    interrupt: vi.fn(),
    upload: vi.fn(),
    subscribe: () => vi.fn(),
    subscribeState: (listener: (state: string) => void) => { listener('idle'); return vi.fn() },
    destroy,
  }),
}))

vi.mock('@/lib/api', () => ({ http: vi.fn() }))

beforeEach(() => {
  sessionStorage.clear()
  connect.mockReset()
  loadHistory.mockReset()
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SessionClientPage', () => {
  it('keeps invitation pairing recoverable and keyboard accessible', () => {
    render(<MemoryRouter initialEntries={['/session-client']}><SessionClientPage /></MemoryRouter>)

    expect(screen.getByRole('heading', { name: '连接受约束开发会话' })).toBeInTheDocument()
    const invitation = screen.getByRole('textbox', { name: '单次邀请码' })
    const connectButton = screen.getByRole('button', { name: '验证并连接' })
    expect(connectButton).toBeDisabled()

    fireEvent.change(invitation, { target: { value: 'one-time-code' } })
    expect(connectButton).toBeEnabled()
    expect(invitation).toHaveAttribute('autocomplete', 'one-time-code')
  })

  it('explains an expired grant and offers a new invitation recovery path', async () => {
    sessionStorage.setItem('kai-session-client:access-token', 'expired-token')
    connect.mockRejectedValue(Object.assign(new Error('授权已过期'), { code: 'GRANT_EXPIRED' }))
    loadHistory.mockResolvedValue({ items: [], transcriptMissing: false })

    render(<MemoryRouter initialEntries={['/session-client']}><SessionClientPage /></MemoryRouter>)

    expect(await screen.findByText('会话授权已过期')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用新的邀请码' })).toBeInTheDocument()
  })
})
