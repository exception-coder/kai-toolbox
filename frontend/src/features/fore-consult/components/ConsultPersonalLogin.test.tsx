import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultPersonalLogin } from './ConsultPersonalLogin'

const http = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ http }))
afterEach(() => { cleanup(); vi.useRealTimers(); vi.resetAllMocks() })

async function open() {
  http.mockResolvedValueOnce({ configured: false, expiresAt: 0 })
  const view = render(<ConsultPersonalLogin consultId="mine" />)
  const details = view.container.querySelector('details')!
  await act(async () => { details.open = true; fireEvent(details, new Event('toggle')) })
  await waitFor(() => expect(screen.getByRole('button', { name: '静默登录并用于本次咨询' })).not.toBeDisabled())
  fireEvent.change(screen.getByLabelText('应用地址'), { target: { value: 'https://test.example' } })
  fireEvent.change(screen.getByLabelText('站点环境'), { target: { value: 'TEST' } })
  fireEvent.change(screen.getByLabelText('个人账号'), { target: { value: 'me' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'private-secret' } })
  return view
}

it('submits only to the owner endpoint and clears password after login and logout', async () => {
  const view = await open()
  http.mockResolvedValueOnce({ configured: true, siteUrl: 'https://test.example', environment: 'TEST', expiresAt: Date.now() + 900000, result: { page: { status: 'READY' } } })
  fireEvent.submit(view.container.querySelector('form')!)
  await screen.findByText(/已登录。继续提问/)
  expect(screen.getByLabelText('密码')).toHaveValue('')
  expect(http).toHaveBeenCalledWith('/fore-consult/sessions/mine/personal-web', expect.objectContaining({ method: 'POST' }), undefined)
  expect(view.container.textContent).not.toContain('private-secret')
  http.mockResolvedValueOnce(undefined)
  fireEvent.click(screen.getByRole('button', { name: '退出个人账号' }))
  await screen.findByText(/已退出，个人账号授权和登录态已释放/)
  expect(http).toHaveBeenLastCalledWith('/fore-consult/sessions/mine/personal-web', expect.objectContaining({ method: 'DELETE' }), 'empty')
})

it('does not echo secrets and requires state reconciliation after uncertain failure', async () => {
  const view = await open()
  http.mockRejectedValueOnce(new Error('private-secret'))
  fireEvent.submit(view.container.querySelector('form')!)
  await screen.findByText(/登录结果未确认/)
  expect(screen.getByLabelText('密码')).toHaveValue('')
  expect(view.container.textContent).not.toContain('private-secret')
  expect(screen.getByRole('button', { name: '静默登录并用于本次咨询' })).toBeDisabled()
  http.mockResolvedValueOnce({ configured: false, expiresAt: 0 })
  fireEvent.click(screen.getByRole('button', { name: '查询登录状态' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '静默登录并用于本次咨询' })).not.toBeDisabled())
})

it('bounds a hanging login, aborts transport and ignores a late success', async () => {
  const view = await open()
  vi.useFakeTimers()
  let resolve!: (value: unknown) => void
  http.mockImplementationOnce(() => new Promise(r => { resolve = r }))
  fireEvent.submit(view.container.querySelector('form')!)
  const signal = http.mock.calls.at(-1)![1].signal as AbortSignal
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  expect(signal.aborted).toBe(true)
  expect(screen.getByText(/登录结果未确认/)).toBeInTheDocument()
  expect(screen.getByLabelText('密码')).toHaveValue('')
  expect(screen.getByRole('button', { name: '查询登录状态' })).not.toBeDisabled()
  await act(async () => { resolve({ configured: true, result: { page: { status: 'READY' } } }) })
  expect(screen.queryByText(/已登录。继续提问/)).not.toBeInTheDocument()
  http.mockResolvedValueOnce(undefined)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '退出个人账号' })) })
  expect(screen.getByText(/已退出/)).toBeInTheDocument()
})

it('bounds status and logout waits without claiming logout succeeded', async () => {
  const view = await open()
  vi.useFakeTimers()
  http.mockImplementationOnce(() => new Promise(() => {}))
  fireEvent.submit(view.container.querySelector('form')!)
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
  for (const name of ['查询登录状态', '退出个人账号']) {
    http.mockImplementationOnce(() => new Promise(() => {}))
    fireEvent.click(screen.getByRole('button', { name }))
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(screen.getByRole('button', { name })).not.toBeDisabled()
  }
  expect(screen.getByText(/退出未确认/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '静默登录并用于本次咨询' })).toBeDisabled()
})
