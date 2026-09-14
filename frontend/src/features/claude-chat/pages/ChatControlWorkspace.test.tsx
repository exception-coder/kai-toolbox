import { useState, type ReactNode } from 'react'
import { Bot } from 'lucide-react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatControlWorkspace } from './ChatControlWorkspace'
import { RouteGuard } from '@/components/auth/RouteGuard'
import { useAccessContext } from '@/shell/permission'
import { hasFeatureAccess } from '@/shell/access'
import type { FeatureManifest } from '@/shell/types'
import { ChatRuntimeProvider, isChatRoute, useChatRuntime } from '../runtime/ChatRuntimeContext'

vi.mock('@/shell/permission', () => ({ useAccessContext: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: [] } }) }))
const developmentAccess = vi.hoisted(() => vi.fn())
vi.mock('@/features/reqpool/api', () => ({ getDevelopmentAccess: developmentAccess }))
vi.mock('./ChatPage', () => ({ ChatPage: ({ renderControl }: { renderControl: () => ReactNode }) => <div>agent-workspace{renderControl()}</div> }))
vi.mock('@/features/ai-chat/public-api', () => ({ LlmChatPage: ({ renderControl }: { renderControl?: () => ReactNode }) => {
  const [draft, setDraft] = useState('')
  return <div>llm-workspace{renderControl?.()}<input aria-label="LLM draft" value={draft} onChange={event => setDraft(event.target.value)} /></div>
} }))

const feature: FeatureManifest = { id: 'claude-chat', name: 'Vibe Coding', icon: Bot, routes: [],
  requiredPermission: 'menu:claude-chat', entry: '/tools/claude-chat',
  controlPermissions: { parameter: 'control', modes: { llm: 'menu:ai-chat' } } }
function Location() { return <output data-testid="location">{useLocation().search}</output> }
function show(entry = '/tools/claude-chat') {
  return render(<MemoryRouter initialEntries={[entry]}><RouteGuard feature={feature}><ChatControlWorkspace /></RouteGuard><Location /></MemoryRouter>)
}
function switchMode(label: '开发助手' | '自由对话') {
  fireEvent.click(screen.getByRole('button', { name: /切换对话方式/ }))
  fireEvent.click(screen.getByRole('button', { name: label }))
}
afterEach(cleanup)
beforeEach(() => vi.mocked(useAccessContext).mockReturnValue({ roles: [], superAdmin: false, permissionCodes: ['menu:claude-chat', 'menu:ai-chat'] }))

describe('chat control modes', () => {
  it('keeps Code Agent as the default', () => {
    show()
    expect(screen.getByText('agent-workspace')).toBeInTheDocument()
    expect(screen.queryByText('llm-workspace')).not.toBeInTheDocument()
  })
  it('opens pure LLM without mounting the coding page', async () => {
    show('/tools/claude-chat?control=llm')
    expect(await screen.findByText('llm-workspace')).toBeVisible()
    expect(screen.queryByText('agent-workspace')).not.toBeInTheDocument()
    expect(isChatRoute('/tools/claude-chat', '?control=llm')).toBe(false)
    expect(isChatRoute('/tools/claude-chat')).toBe(true)
  })
  it('preserves LLM draft and Agent session routing when switching', async () => {
    show('/tools/claude-chat?sessionId=existing-agent')
    switchMode('自由对话')
    fireEvent.change(await screen.findByLabelText('LLM draft'), { target: { value: 'draft' } })
    await waitFor(() => expect(screen.getByRole('button', { name: '切换对话方式，当前自由对话' })).toHaveFocus())
    switchMode('开发助手')
    expect(screen.getByTestId('location')).toHaveTextContent('?sessionId=existing-agent')
    switchMode('自由对话')
    expect(screen.getByLabelText('LLM draft')).toHaveValue('draft')
  })
  it('allows an LLM-only user into the shared entry without granting Agent access', async () => {
    const access = { roles: [], superAdmin: false, permissionCodes: ['menu:ai-chat'] }
    vi.mocked(useAccessContext).mockReturnValue(access)
    expect(hasFeatureAccess(feature, access)).toBe(true)
    show()
    expect(await screen.findByText('llm-workspace')).toBeVisible()
    expect(screen.queryByText('agent-workspace')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /切换对话方式/ }))
    expect(screen.getByRole('button', { name: '开发助手' })).toBeDisabled()
  })
  it('does not grant pure LLM access based on Agent permission alone', () => {
    vi.mocked(useAccessContext).mockReturnValue({ roles: [], superAdmin: false, permissionCodes: ['menu:claude-chat'] })
    show('/tools/claude-chat?control=llm')
    expect(screen.getByText('无权访问')).toBeInTheDocument()
    expect(screen.queryByText('llm-workspace')).not.toBeInTheDocument()
  })
  it('does not let alternate permission enter the session client', async () => {
    vi.mocked(useAccessContext).mockReturnValue({ roles: [], superAdmin: false, permissionCodes: ['menu:ai-chat'] })
    show('/session-client?control=llm')
    await waitFor(() => expect(screen.getByText('无权访问')).toBeInTheDocument())
  })
  it('keeps the actual runtime inactive on a fresh LLM visit', () => {
    localStorage.clear()
    function Probe() { return <span>{useChatRuntime().active ? 'active' : 'inactive'}</span> }
    render(<MemoryRouter initialEntries={['/tools/claude-chat?control=llm']}>
      <ChatRuntimeProvider><Probe /></ChatRuntimeProvider>
    </MemoryRouter>)
    expect(screen.getByText('inactive')).toBeInTheDocument()
  })
  it('retains the existing scoped PRD authorization for Code Agent', async () => {
    vi.mocked(useAccessContext).mockReturnValue({ roles: [], superAdmin: false, permissionCodes: [] })
    developmentAccess.mockResolvedValue({})
    show('/tools/claude-chat?prdSessionId=authorized-prd')
    expect(await screen.findByText('agent-workspace')).toBeVisible()
    expect(developmentAccess).toHaveBeenCalledWith('authorized-prd')
    fireEvent.click(screen.getByRole('button', { name: /切换对话方式/ }))
    expect(screen.getByRole('button', { name: '自由对话' })).toBeDisabled()
  })
})
