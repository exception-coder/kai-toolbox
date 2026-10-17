import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CONSULT_UPGRADE_TEXT, ConsultUpgradeNotice } from './ConsultUpgradeNotice'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function setClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
}
afterEach(() => {
  cleanup(); vi.restoreAllMocks()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

it('opens on demand, copies the announcement and returns focus without discarding a question draft', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  setClipboard(writeText)
  render(<><textarea aria-label="提问草稿" defaultValue="还要核查另一条订单" /><ConsultUpgradeNotice /></>)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const trigger = screen.getByRole('button', { name: '查看升级公告' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(await screen.findByRole('dialog', { name: '业务咨询升级' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '边等边准备' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '复制公告' }))
  await screen.findByText('已复制，可转发给同事')
  expect(writeText).toHaveBeenCalledWith(CONSULT_UPGRADE_TEXT)
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('textbox', { name: '提问草稿' })).toHaveValue('还要核查另一条订单')
})

it('keeps the notice readable and supports retry when clipboard access fails', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
  setClipboard(writeText)
  render(<ConsultUpgradeNotice />)
  fireEvent.click(screen.getByRole('button', { name: '查看升级公告' }))
  fireEvent.click(await screen.findByRole('button', { name: '复制公告' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
  expect(screen.getByRole('heading', { name: '关联系统自动找' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '复制公告' }))
  expect(await screen.findByText('已复制，可转发给同事')).toBeVisible()
  expect(writeText).toHaveBeenCalledTimes(2)
})
