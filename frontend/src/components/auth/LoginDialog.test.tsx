import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginDialog } from './LoginDialog'

const { login } = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('@/lib/auth', () => ({ login }))
vi.mock('@/shell/BrandLogo', () => ({ BrandLogo: () => null }))
vi.mock('@/shell/brand', () => ({ BRAND_DEFAULTS: { appName: 'Forge', tagline: '工作台' } }))

beforeEach(() => {
  login.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(cleanup)

function inputs() {
  return {
    account: screen.getByRole('textbox', { name: '登录账号' }) as HTMLInputElement,
    password: screen.getByLabelText('登录密码') as HTMLInputElement,
    form: screen.getByRole('form', { name: '账号登录' }),
  }
}

describe('browser-managed login credentials', () => {
  it('submits values autofilled without input/change events and does not persist credentials', async () => {
    const onClose = vi.fn()
    const onSuccess = vi.fn()
    login.mockResolvedValue(undefined)
    render(<LoginDialog open onClose={onClose} onSuccess={onSuccess} />)
    const { account, password } = inputs()
    account.value = 'browser-account'
    password.value = 'browser-secret'

    expect(account).toHaveAttribute('autocomplete', 'username')
    expect(password).toHaveAttribute('autocomplete', 'current-password')
    expect(screen.getByRole('button', { name: '登录' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '登录' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(login).toHaveBeenCalledExactlyOnceWith('browser-account', 'browser-secret')
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)
  })

  it('uses native required-field validation before sending a request', () => {
    render(<LoginDialog open onClose={vi.fn()} />)
    const { account, password, form } = inputs()
    fireEvent.submit(form)
    account.value = 'browser-account'
    fireEvent.submit(form)
    expect(account.required).toBe(true)
    expect(password.required).toBe(true)
    expect(password.validationMessage).not.toBe('')
    expect(login).not.toHaveBeenCalled()
  })

  it('keeps autofilled values after a failed attempt and allows retry', async () => {
    login.mockRejectedValueOnce(new Error('账号或密码错误')).mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    render(<LoginDialog open onClose={onClose} />)
    const { account, password, form } = inputs()
    account.value = 'browser-account'
    password.value = 'first-secret'
    fireEvent.submit(form)
    expect(await screen.findByRole('alert')).toHaveTextContent('账号或密码错误')
    expect(account.value).toBe('browser-account')
    password.value = 'corrected-secret'
    fireEvent.submit(form)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(login).toHaveBeenLastCalledWith('browser-account', 'corrected-secret')
  })

  it('prevents duplicate requests while a login is pending', async () => {
    let resolve!: () => void
    login.mockImplementation(() => new Promise<void>(done => { resolve = done }))
    render(<LoginDialog open onClose={vi.fn()} />)
    const { account, password, form } = inputs()
    account.value = 'browser-account'
    password.value = 'browser-secret'
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(screen.getByRole('button', { name: '登录中…' })).toBeDisabled()
    expect(login).toHaveBeenCalledOnce()
    resolve()
    await waitFor(() => expect(screen.getByRole('button', { name: '登录' })).toBeEnabled())
  })

  it('removes entered credentials on cancel, and reopens with empty fields', () => {
    const onClose = vi.fn()
    const view = render(<LoginDialog open onClose={onClose} />)
    const { account, password } = inputs()
    account.value = 'browser-account'
    password.value = 'browser-secret'
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onClose).toHaveBeenCalledOnce()
    expect(login).not.toHaveBeenCalled()
    view.rerender(<LoginDialog open={false} onClose={onClose} />)
    expect(screen.queryByLabelText('登录密码')).not.toBeInTheDocument()
    view.rerender(<LoginDialog open onClose={onClose} />)
    expect(inputs().account.value).toBe('')
    expect(inputs().password.value).toBe('')
  })

  it('removes the password form after successful login so the browser can detect completion', async () => {
    login.mockResolvedValue(undefined)
    const onClose = vi.fn()
    const view = render(<LoginDialog open onClose={onClose} />)
    const { account, password, form } = inputs()
    account.value = 'browser-account'
    password.value = 'browser-secret'
    fireEvent.submit(form)
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    view.rerender(<LoginDialog open={false} onClose={onClose} />)
    expect(screen.queryByRole('form', { name: '账号登录' })).not.toBeInTheDocument()
    view.rerender(<LoginDialog open onClose={onClose} />)
    expect(inputs().password.value).toBe('')
  })
})
