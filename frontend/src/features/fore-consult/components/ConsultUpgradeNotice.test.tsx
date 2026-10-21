import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConsultUpgradeNotice } from './ConsultUpgradeNotice'
import { CONSULT_UPGRADE_NOTES } from '../data/upgradeNotes'

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks() })

it('shows five concise updates and opens complete history without losing draft or focus', async () => {
  render(<><textarea aria-label="提问草稿" defaultValue="继续核查订单" /><ConsultUpgradeNotice /></>)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const paper = screen.getByRole('complementary', { name: '近期升级纸签' })
  expect(paper).toHaveTextContent(CONSULT_UPGRADE_NOTES[0].title)
  expect(paper).not.toHaveTextContent('2026-10-18')
  expect(within(paper).getAllByRole('listitem').map(item => item.textContent?.slice(2)))
    .toEqual(CONSULT_UPGRADE_NOTES.slice(0, 5).map(note => note.title))
  expect(paper).not.toHaveTextContent(CONSULT_UPGRADE_NOTES[5].title)
  const trigger = screen.getByRole('button', { name: '查看近期升级详情' })
  trigger.focus(); fireEvent.click(trigger)
  const drawer = await screen.findByRole('dialog', { name: '近期升级' })
  expect(within(drawer).getAllByRole('listitem')).toHaveLength(CONSULT_UPGRADE_NOTES.length)
  expect(document.querySelector('[data-radix-dialog-overlay]')).toBeNull()
  // 非模态：操作背景不会关闭详情或禁止继续编辑。
  const draft = screen.getByRole('textbox', { name: '提问草稿' })
  fireEvent.change(draft, { target: { value: '继续核查另一笔订单' } })
  fireEvent.keyDown(drawer, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(draft).toHaveValue('继续核查另一笔订单')
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('remembers dismissal per user, restores via toolbar and reappears for a new release', async () => {
  const { unmount } = render(<ConsultUpgradeNotice userId={21} />)
  fireEvent.click(screen.getByRole('button', { name: '收起升级纸签' }))
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  unmount()
  const next = render(<ConsultUpgradeNotice userId={21} />)
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  next.rerender(<ConsultUpgradeNotice userId={22} />)
  expect(screen.getByRole('complementary')).toBeVisible()
  next.rerender(<ConsultUpgradeNotice userId={21} open />)
  await screen.findByRole('dialog')
  await waitFor(() => expect(screen.getByRole('complementary')).toBeVisible())
  next.unmount()
  render(<ConsultUpgradeNotice userId={21} />)
  fireEvent.click(screen.getByRole('button', { name: '收起升级纸签' }))
  cleanup()
  render(<ConsultUpgradeNotice userId={21} notices={[{ ...CONSULT_UPGRADE_NOTES[0], id: 'new-release', date: CONSULT_UPGRADE_NOTES[0].date }, ...CONSULT_UPGRADE_NOTES]} />)
  expect(screen.getByRole('complementary')).toBeVisible()
})

it('retains all history and sorts newest first without mutating the source', async () => {
  const notices = Array.from({ length: 7 }, (_, i) => ({ ...CONSULT_UPGRADE_NOTES[0], id: `note-${i}`, date: `2026-10-0${i + 1}`, title: `更新${i + 1}` }))
  const { rerender } = render(<ConsultUpgradeNotice notices={notices} />)
  const paper = screen.getByRole('complementary', { name: '近期升级纸签' })
  expect(within(paper).getAllByRole('listitem').map(item => item.textContent?.slice(2)))
    .toEqual(['更新7', '更新6', '更新5', '更新4', '更新3'])
  fireEvent.click(screen.getByRole('button', { name: '查看近期升级详情' }))
  const drawer = await screen.findByRole('dialog', { name: '近期升级' })
  expect(within(drawer).getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent))
    .toEqual(['更新7', '更新6', '更新5', '更新4', '更新3', '更新2', '更新1'])
  expect(notices[0].id).toBe('note-0')
  rerender(<ConsultUpgradeNotice notices={[]} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('supports closing for this page when local storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  render(<ConsultUpgradeNotice />)
  fireEvent.click(screen.getByRole('button', { name: '收起升级纸签' }))
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})
