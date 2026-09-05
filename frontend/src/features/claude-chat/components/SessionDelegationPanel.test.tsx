import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionDelegationPanel } from './SessionDelegationPanel'

const listSessionDelegations = vi.fn()

vi.mock('../api', () => ({
  listSessionDelegations: (...args: unknown[]) => listSessionDelegations(...args),
  createSessionDelegation: vi.fn(),
  listSessionDelegationAudit: vi.fn(),
  reissueSessionInvitation: vi.fn(),
  revokeSessionDelegation: vi.fn(),
  transitionSessionDelegation: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ http: vi.fn().mockResolvedValue([]) }))

afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('SessionDelegationPanel', () => {
  it('exposes owner controls and contains the wide table on narrow screens', async () => {
    listSessionDelegations.mockResolvedValue([{
      grant: {
        id: 'grant-1234567890', sessionId: 'session-1', subjectUserId: 12, ownerUserId: 1,
        profile: 'DELEGATED_DEVELOPMENT', status: 'ACTIVE', expiresAt: '2026-09-06T08:00:00Z',
        maxTurns: 30, usedTurns: 2, maxInputBytes: 65536, version: 3,
      },
      connectedClients: 1,
    }])

    const { container } = render(<SessionDelegationPanel sessionId="session-1" />)

    expect(await screen.findByText('在线 1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '暂停' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重发邀请' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '接管并撤销参与者访问' })).toBeInTheDocument()
    expect(container.querySelector('.overflow-x-auto > .min-w-\\[720px\\]')).not.toBeNull()
  })
})
