import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { MessageCopyButton } from './MessageCopyButton'
import { copyRichTextToClipboard, copyTextToClipboard } from '../lib/clipboard'

vi.mock('../lib/clipboard', () => ({ copyTextToClipboard: vi.fn(async () => {}), copyRichTextToClipboard: vi.fn(async () => 'rich') }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
const source = '## 方案\n\n- **保留列表**'

it('copies readable text by default and retains the complete Markdown alternative', async () => {
  render(<MessageCopyButton text={source} />)
  fireEvent.click(screen.getByRole('button', { name: '复制回复' }))
  await waitFor(() => expect(copyTextToClipboard).toHaveBeenCalledWith('【方案】\n\n• 保留列表'))
  fireEvent.click(screen.getByRole('button', { name: '复制回复：选择格式' }))
  expect(screen.getByText(/飞书、企微、钉钉聊天/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: /Markdown 原文/ }))
  await waitFor(() => expect(copyTextToClipboard).toHaveBeenLastCalledWith(source))
})

it('writes rich HTML with a readable fallback and discloses an actual plain-text downgrade', async () => {
  vi.mocked(copyRichTextToClipboard).mockResolvedValueOnce('readable')
  render(<MessageCopyButton text={source} />)
  fireEvent.click(screen.getByRole('button', { name: '复制回复：选择格式' }))
  fireEvent.click(screen.getByRole('button', { name: /^富文本 / }))
  expect(await screen.findByText('富文本不可用，已复制易读文本')).toBeVisible()
  expect(copyRichTextToClipboard).toHaveBeenCalledWith('【方案】\n\n• 保留列表', expect.stringContaining('<h2>方案</h2>'))
})

it('retains the failed format for direct retry and restores focus when the menu closes', async () => {
  vi.mocked(copyTextToClipboard).mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce()
  render(<MessageCopyButton text={source} />)
  const trigger = screen.getByRole('button', { name: '复制回复：选择格式' })
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('button', { name: /Markdown 原文/ }))
  await screen.findByText('复制失败，重试')
  fireEvent.click(screen.getByRole('button', { name: '复制回复' }))
  await waitFor(() => expect(copyTextToClipboard).toHaveBeenLastCalledWith(source))
  await waitFor(() => expect(trigger).toHaveFocus())
})
