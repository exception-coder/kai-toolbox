import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultPersonalLogin } from './ConsultPersonalLogin'

const http = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ http }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

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
  expect(http).toHaveBeenCalledWith('/fore-consult/sessions/mine/personal-web', expect.objectContaining({ method: 'POST' }))
  expect(view.container.textContent).not.toContain('private-secret')
  http.mockResolvedValueOnce(undefined)
  fireEvent.click(screen.getByRole('button', { name: '退出个人账号' }))
  await screen.findByText(/已退出，个人账号授权和登录态已释放/)
  expect(http).toHaveBeenLastCalledWith('/fore-consult/sessions/mine/personal-web', { method: 'DELETE' }, 'empty')
})

it('does not echo errors containing secrets and permits correction after failure', async () => {
  const view = await open()
  http.mockRejectedValueOnce(new Error('private-secret'))
  fireEvent.submit(view.container.querySelector('form')!)
  await screen.findByText(/登录未完成，请核对站点/)
  expect(screen.getByLabelText('密码')).toHaveValue('')
  expect(view.container.textContent).not.toContain('private-secret')
  expect(screen.getByRole('button', { name: '静默登录并用于本次咨询' })).not.toBeDisabled()
})
