import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { AssistantSetup } from './AssistantSetup'
import { resolveWeeklyRequest } from '../api'
vi.mock('../api', () => ({ resolveWeeklyRequest: vi.fn() }))
vi.mock('@/features/claude-chat/public-api/voice', () => ({ VoiceInputButton: () => <span>语音</span> }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { userId: 7 } }) }))
afterEach(() => { cleanup(); vi.resetAllMocks(); localStorage.clear() })

it('remembers the selected project when the setup is reopened', () => {
  const props = { assistant: 'weekly', projects: [{ id: 'erp', name: 'ERP', path: '/erp' }], busy: false, onStart: vi.fn() }
  const first = render(<AssistantSetup {...props} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'ERP' }))
  first.unmount()
  render(<AssistantSetup {...props} />)
  expect(screen.getByRole('checkbox', { name: 'ERP' })).toBeChecked()
})

it('puts selected projects first and changes only the week in the retained request', () => {
  const projects = ['A', 'B', 'C'].map(id => ({ id, name: id, path: `/${id}` }))
  render(<AssistantSetup assistant="weekly" projects={projects} busy={false} onStart={vi.fn()} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'C' }))
  expect(screen.getAllByRole('checkbox').map(input => input.closest('label')?.textContent)).toEqual(['C', 'A', 'B'])
  const input = screen.getByRole('textbox', { name: '交给助理的工作' })
  expect((input as HTMLTextAreaElement).value).toContain('【作者姓名或邮箱】上周')
  expect(screen.getByRole('button', { name: '交给助理' })).toBeDisabled()
  fireEvent.change(input, { target: { value: '查看张凯上周的提交，保留业务模块和证据要求' } })
  fireEvent.click(screen.getByRole('button', { name: '本周' }))
  expect(input).toHaveValue('查看张凯本周的提交，保留业务模块和证据要求')
  fireEvent.click(screen.getByRole('button', { name: '上周' }))
  expect(input).toHaveValue('查看张凯上周的提交，保留业务模块和证据要求')
})

it('starts directly from the selected project and a natural request, without author/date fields', async () => {
  const scope = { projectIds: ['erp'], from: '2026-10-12', through: '2026-10-18', author: '张凯' }
  vi.mocked(resolveWeeklyRequest).mockResolvedValue({ scope, message: '已识别上周张凯' })
  const start = vi.fn().mockResolvedValue(undefined)
  render(<AssistantSetup assistant="weekly" projects={[{ id: 'erp', name: 'ERP', path: '/erp' }]} busy={false} onStart={start} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'ERP' }))
  fireEvent.change(screen.getByRole('textbox', { name: '交给助理的工作' }), { target: { value: '看看我上周张凯的提交' } })
  expect(screen.queryByLabelText('作者姓名或邮箱')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '交给助理' }))
  await waitFor(() => expect(start).toHaveBeenCalledWith('codex', '', scope, '看看我上周张凯的提交'))
})

it('asks only for missing conditions and keeps the original text without creating a session', async () => {
  vi.mocked(resolveWeeklyRequest).mockResolvedValue({ scope: null, message: '请告诉我作者' })
  const start = vi.fn()
  render(<AssistantSetup assistant="weekly" projects={[{ id: 'erp', name: 'ERP', path: '/erp' }]} busy={false} onStart={start} />)
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.change(screen.getByRole('textbox', { name: '交给助理的工作' }), { target: { value: '看看上周提交' } })
  fireEvent.click(screen.getByRole('button', { name: '交给助理' }))
  await screen.findByText('请告诉我作者')
  expect(start).not.toHaveBeenCalled()
  expect(screen.getByRole('textbox', { name: '交给助理的工作' })).toHaveValue('看看上周提交')
})
