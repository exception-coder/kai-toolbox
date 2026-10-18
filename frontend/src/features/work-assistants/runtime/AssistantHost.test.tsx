import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/confirm-dialog'
import { AssistantHost } from './AssistantHost'

const access = vi.hoisted(() => ({ allowed: true, user: { userId: 1 } as { userId: number } | null }))
vi.mock('@/shell/permission', () => ({ usePermission: () => access.allowed }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: access.user }) }))
vi.mock('../components/AssistantWorkspace', () => ({ AssistantWorkspace: ({ memory, onSecureDirtyChange }: { memory: { drafts: Record<string, string> }; onSecureDirtyChange: (dirty: boolean) => void }) => <div><button onClick={() => { memory.drafts.task = '保留草稿'; onSecureDirtyChange(true) }}>填写登记信息</button><output>{memory.drafts.task || '空草稿'}</output></div> }))
beforeEach(() => { access.allowed = true; access.user = { userId: 1 } })
afterEach(cleanup)

it('opens only on demand, protects unsaved secure entries and preserves ordinary draft memory', async () => {
  render(<ConfirmProvider><AssistantHost><p>原工作页面</p></AssistantHost></ConfirmProvider>)
  expect(screen.queryByText('空草稿')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '唤醒工作助理' }))
  fireEvent.click(await screen.findByRole('button', { name: '填写登记信息' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  await screen.findByRole('dialog', { name: '清除未保存的登记信息？' })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(screen.getByRole('dialog', { name: '工作助理' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  fireEvent.click(await screen.findByRole('button', { name: '清除并关闭' }))
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '工作助理' })).not.toBeInTheDocument())
  fireEvent.click(screen.getByRole('button', { name: '唤醒工作助理' }))
  expect(await screen.findByText('保留草稿')).toBeInTheDocument()
})

it('supports the wake shortcut and hides the launcher without access', async () => {
  const view = render(<ConfirmProvider><AssistantHost><p>原工作页面</p></AssistantHost></ConfirmProvider>)
  fireEvent.keyDown(window, { altKey: true, shiftKey: true, code: 'KeyA' })
  expect(await screen.findByRole('dialog', { name: '工作助理' })).toBeInTheDocument()
  access.allowed = false
  view.rerender(<ConfirmProvider><AssistantHost><p>原工作页面</p></AssistantHost></ConfirmProvider>)
  expect(screen.queryByRole('button', { name: '唤醒工作助理' })).not.toBeInTheDocument()
  expect(screen.queryByRole('dialog', { name: '工作助理' })).not.toBeInTheDocument()
})

it('switching login identities never reuses the previous users draft memory', async () => {
  const view = render(<ConfirmProvider><AssistantHost><p>原工作页面</p></AssistantHost></ConfirmProvider>)
  fireEvent.click(screen.getByRole('button', { name: '唤醒工作助理' }))
  fireEvent.click(await screen.findByRole('button', { name: '填写登记信息' }))
  access.user = { userId: 2 }
  view.rerender(<ConfirmProvider><AssistantHost><p>原工作页面</p></AssistantHost></ConfirmProvider>)
  expect(screen.queryByText('保留草稿')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '唤醒工作助理' }))
  expect(await screen.findByText('空草稿')).toBeInTheDocument()
})
