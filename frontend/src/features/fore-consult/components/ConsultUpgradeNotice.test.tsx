import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultUpgradeNotice } from './ConsultUpgradeNotice'
import { CONSULT_UPGRADE_NOTES, formatUpgradeNote } from '../data/upgradeNotes'

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
  const trigger = screen.getByRole('button', { name: '查看更新小纸条' })
  trigger.focus()
  fireEvent.click(trigger)
  expect(await screen.findByRole('dialog', { name: '更新小纸条' })).toBeVisible()
  expect(screen.getByRole('heading', { name: '边等边准备' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '复制小纸条：业务咨询升级' }))
  await screen.findByText('已复制，可转发给同事')
  expect(writeText).toHaveBeenCalledWith(formatUpgradeNote(CONSULT_UPGRADE_NOTES[0]))
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
  expect(screen.getByRole('textbox', { name: '提问草稿' })).toHaveValue('还要核查另一条订单')
})

it('keeps the notice readable and supports retry when clipboard access fails', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
  setClipboard(writeText)
  render(<ConsultUpgradeNotice />)
  fireEvent.click(screen.getByRole('button', { name: '查看更新小纸条' }))
  fireEvent.click(await screen.findByRole('button', { name: '复制小纸条：业务咨询升级' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('复制失败')
  expect(screen.getByRole('heading', { name: '关联系统自动找' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '复制小纸条：业务咨询升级' }))
  expect(await screen.findByText('已复制，可转发给同事')).toBeVisible()
  expect(writeText).toHaveBeenCalledTimes(2)
})

it('retains history, orders newest first and copies only the selected note', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  setClipboard(writeText)
  const older = { ...CONSULT_UPGRADE_NOTES[0], id: 'older', date: '2026-10-01', title: '早期更新' }
  render(<ConsultUpgradeNotice notices={[older, ...CONSULT_UPGRADE_NOTES]} />)
  fireEvent.click(screen.getByRole('button', { name: '查看更新小纸条' }))
  expect((await screen.findAllByRole('article')).map(article => article.getAttribute('aria-label')))
    .toEqual(['业务咨询升级', '早期更新'])
  fireEvent.click(screen.getByRole('button', { name: '复制小纸条：早期更新' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(formatUpgradeNote(older)))
  expect(writeText.mock.calls[0][0]).not.toContain('业务咨询升级')
  expect(screen.getAllByText('已复制，可转发给同事')).toHaveLength(1)
})
