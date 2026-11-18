import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SdkUpgradeActions } from './SdkUpgradeActions'

const { http, auth } = vi.hoisted(() => ({ http: vi.fn(), auth: { user: { roles: ['ADMIN'] } } }))
vi.mock('@/lib/api', () => ({ http }))
vi.mock('@/lib/auth', () => ({ useAuth: () => auth }))
afterEach(cleanup)
beforeEach(() => {
  auth.user.roles = ['ADMIN']
  http.mockReset().mockResolvedValue({ running: false, phase: 'IDLE', message: '' })
})

it('submits multiple selected engines in one request and disables an empty selection', async () => {
  render(<SdkUpgradeActions onUpdated={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '清空' }))
  expect(screen.getByRole('button', { name: '检查并升级所选 0 项' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Codex SDK' }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'Claude Agent SDK' }))
  fireEvent.click(screen.getByRole('button', { name: '检查并升级所选 2 项' }))
  await waitFor(() => expect(http).toHaveBeenCalledWith(
    '/claude-chat/sidecar/upgrade?engines=codex&engines=claude', { method: 'POST' }))
  expect(http.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})

it('selects all built-in SDKs without offering external runtimes', () => {
  render(<SdkUpgradeActions onUpdated={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: '全选' }))
  expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  screen.getAllByRole('checkbox').forEach(checkbox => expect(checkbox).toBeChecked())
})

it('retains administrator-only access', () => {
  auth.user.roles = ['USER']
  render(<SdkUpgradeActions onUpdated={vi.fn()} />)
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(http).not.toHaveBeenCalled()
})

it('restores the running batch selection after reopening the panel', async () => {
  http.mockResolvedValue({ running: true, phase: 'CHECKING', engine: 'claude,qwen', message: '检查中' })
  render(<SdkUpgradeActions onUpdated={vi.fn()} />)
  await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Claude Agent SDK' })).toBeChecked())
  expect(screen.getByRole('checkbox', { name: 'Qwen Code SDK' })).toBeChecked()
  expect(screen.getByRole('checkbox', { name: 'Codex SDK' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: '正在升级…' })).toBeDisabled()
})
