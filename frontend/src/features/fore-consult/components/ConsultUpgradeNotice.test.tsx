import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ConsultUpgradeNotice } from './ConsultUpgradeNotice'
import { CONSULT_UPGRADE_NOTES } from '../data/upgradeNotes'

afterEach(cleanup)

it('shows five upgrades directly without a trigger or dialog and preserves the question draft', () => {
  render(<><textarea aria-label="提问草稿" defaultValue="还要核查另一条订单" /><ConsultUpgradeNotice /></>)
  const note = screen.getByRole('complementary', { name: '近期重大升级' })
  expect(within(note).getAllByRole('listitem')).toHaveLength(5)
  expect(within(note).getByRole('heading', { name: '截图直接问' })).toBeVisible()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '查看更新小纸条' })).not.toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: '提问草稿' })).toHaveValue('还要核查另一条订单')
})

it('shows only the five newest entries without deleting or reordering the registry', () => {
  const notices = Array.from({ length: 7 }, (_, i) => ({
    ...CONSULT_UPGRADE_NOTES[0], id: `note-${i}`, date: `2026-10-0${i + 1}`, title: `更新${i + 1}`,
  }))
  render(<ConsultUpgradeNotice notices={notices} />)
  expect(screen.getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent))
    .toEqual(['更新7', '更新6', '更新5', '更新4', '更新3'])
  expect(notices).toHaveLength(7)
  expect(notices[0].id).toBe('note-0')
})

it('keeps the registration order on the same date and hides an empty note', () => {
  const { rerender } = render(<ConsultUpgradeNotice notices={CONSULT_UPGRADE_NOTES.slice(0, 2)} />)
  expect(screen.getAllByRole('listitem').map(item => within(item).getByRole('heading').textContent))
    .toEqual(CONSULT_UPGRADE_NOTES.slice(0, 2).map(note => note.title))
  rerender(<ConsultUpgradeNotice notices={[]} />)
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})
