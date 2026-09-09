import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectRegistrationForm } from './ProjectRegistrationForm'
import { registerProject } from './api'

vi.mock('@/features/claude-chat/public-api', () => ({ listWorkspaces: vi.fn(async () => ({ roots: [] })) }))
vi.mock('./api', () => ({ registerProject: vi.fn(), updateProject: vi.fn() }))

describe('project registration', () => {
  afterEach(cleanup)
  beforeEach(() => vi.clearAllMocks())

  it('registers identity without starting initialization', async () => {
    const saved = vi.fn()
    vi.mocked(registerProject).mockResolvedValue({ id: 'forge', state: 'UNINITIALIZED' } as Awaited<ReturnType<typeof registerProject>>)
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProjectRegistrationForm onSaved={saved} /></QueryClientProvider>)
    fireEvent.change(screen.getByLabelText(/系统名称/), { target: { value: 'Forge' } })
    fireEvent.change(screen.getByLabelText(/本地代码目录/), { target: { value: 'D:/repo' } })
    fireEvent.click(screen.getByRole('button', { name: '登记项目' }))
    await waitFor(() => expect(saved).toHaveBeenCalled())
    expect(registerProject).toHaveBeenCalledWith(expect.objectContaining({ name: 'Forge', localPath: 'D:/repo' }))
  })

  it('retains input and exposes a duplicate-directory error', async () => {
    vi.mocked(registerProject).mockRejectedValue(new Error('该本地目录已登记'))
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><ProjectRegistrationForm onSaved={vi.fn()} /></QueryClientProvider>)
    fireEvent.change(screen.getByLabelText(/系统名称/), { target: { value: 'Forge' } })
    fireEvent.change(screen.getByLabelText(/本地代码目录/), { target: { value: 'D:/repo' } })
    fireEvent.click(screen.getByRole('button', { name: '登记项目' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('该本地目录已登记')
    expect(screen.getByLabelText(/系统名称/)).toHaveValue('Forge')
  })
})
