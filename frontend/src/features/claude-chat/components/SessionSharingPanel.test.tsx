import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SessionSharingPanel } from './SessionSharingPanel'
import { grantSessionReader, listSessionReaders, revokeSessionReader, searchSessionRecipients } from '../sessionSharingApi'

vi.mock('../sessionSharingApi', () => ({ grantSessionReader: vi.fn(), listSessionReaders: vi.fn(),
  listSharedSessions: vi.fn(), revokeSessionReader: vi.fn(), searchSessionRecipients: vi.fn(),
  sharedSessionPath: (id: string) => `/tools/claude-chat/shared/${id}` }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('selects an exact account, grants read access then allows revocation', async () => {
  const recipient = { id: 8, username: 'yanwei', realName: '严伟' }
  vi.mocked(listSessionReaders).mockResolvedValueOnce([]).mockResolvedValueOnce([recipient]).mockResolvedValueOnce([])
  vi.mocked(searchSessionRecipients).mockResolvedValue([recipient])
  vi.mocked(grantSessionReader).mockResolvedValue(undefined)
  vi.mocked(revokeSessionReader).mockResolvedValue(undefined)
  render(<MemoryRouter><SessionSharingPanel sessionId="one" onClose={vi.fn()} /></MemoryRouter>)
  fireEvent.change(await screen.findByLabelText('用户名或姓名'), { target: { value: '严伟' } })
  fireEvent.click(await screen.findByRole('button', { name: '授权查看' }))
  await waitFor(() => expect(grantSessionReader).toHaveBeenCalledWith('one', 8))
  fireEvent.click(await screen.findByRole('button', { name: '撤销' }))
  await waitFor(() => expect(revokeSessionReader).toHaveBeenCalledWith('one', 8))
  expect(await screen.findByText('已撤销，后续读取将被拒绝')).toBeTruthy()
})
