import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MarkdownCardDialog } from './MarkdownCardDialog'
import { MarkdownCardPage } from '../pages/MarkdownCardPage'
import { DEFAULT_STATE, loadState, saveState } from '../lib/persistence'
import { captureNode, saveImage } from '../lib/exporter'

const access = vi.hoisted(() => ({ superAdmin: true, roles: [] as string[], permissionCodes: [] as string[] }))
vi.mock('@/shell/permission', () => ({ useAccessContext: () => access }))
vi.mock('../components/CardRenderer', () => ({ CardRenderer: ({ text, singleNodeRef }: { text: string; singleNodeRef: React.Ref<HTMLDivElement> }) => <div ref={singleNodeRef} data-testid="card-preview">{text}</div> }))
vi.mock('../lib/exporter', () => ({ captureNode: vi.fn(), saveImage: vi.fn(), buildFilename: () => 'card.png', exportSlides: vi.fn() }))

beforeEach(() => {
  access.superAdmin = true
  localStorage.clear()
  saveState({ ...DEFAULT_STATE, sourceText: '独立工具草稿', theme: 'dark' })
  vi.mocked(captureNode).mockResolvedValue('data:image/png;base64,test')
  vi.mocked(saveImage).mockResolvedValue('downloaded')
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals() })

it.each([true, false])('keeps edits while switching sizes without overwriting the standalone draft (mobile=%s)', async mobile => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  const close = vi.fn()
  render(<MarkdownCardDialog sourceText="# 完整回复" onClose={close} />)
  const dialog = screen.getByRole('dialog', { name: '转卡片' })
  expect(dialog).toHaveAttribute('data-fullscreen', String(mobile))
  const editor = await screen.findByRole('textbox', { name: '卡片 Markdown 正文' }, { timeout: 10000 })
  expect(editor).toHaveValue('# 完整回复')
  fireEvent.change(editor, { target: { value: '# 修改后的卡片' } })
  const resize = () => screen.getByRole('button', { name: /^(全屏|缩小)卡片编辑器$/ })
  fireEvent.click(resize()); fireEvent.click(resize())
  expect(screen.getByRole('textbox', { name: '卡片 Markdown 正文' })).toBe(editor)
  expect(editor).toHaveValue('# 修改后的卡片')
  expect(loadState()).toMatchObject({ sourceText: '独立工具草稿', theme: 'dark' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(close).toHaveBeenCalledOnce()
})

it('exports through the existing renderer and protects the mounted editor until export settles', async () => {
  let finish!: (value: string) => void
  vi.mocked(captureNode).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const close = vi.fn()
  render(<MarkdownCardDialog sourceText="要导出的回复" onClose={close} />)
  const exportButton = (await screen.findAllByRole('button', { name: '导出 PNG' }, { timeout: 10000 }))[0]
  fireEvent.click(exportButton)
  await waitFor(() => expect(screen.getByRole('button', { name: '关闭卡片编辑器' })).toBeDisabled())
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(close).not.toHaveBeenCalled()
  await act(async () => finish('data:image/png;base64,result'))
  await waitFor(() => expect(screen.getByRole('button', { name: '关闭卡片编辑器' })).toBeEnabled())
  expect(captureNode).toHaveBeenCalledWith(screen.getByTestId('card-preview'))
  expect(saveImage).toHaveBeenCalledWith('data:image/png;base64,result', 'card.png')
})

it('preserves the content tool permission boundary and offers a close action', () => {
  access.superAdmin = false
  const close = vi.fn()
  render(<MarkdownCardDialog sourceText="回复" onClose={close} />)
  expect(screen.getByRole('status')).toHaveTextContent('尚未获得卡片工具权限')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭卡片编辑器' }))
  expect(close).toHaveBeenCalledOnce()
})

it('retains the edited reply and permits retry after an export failure', async () => {
  vi.mocked(captureNode).mockRejectedValueOnce(new Error('图片渲染失败')).mockResolvedValueOnce('data:image/png;base64,retry')
  render(<MarkdownCardDialog sourceText="可恢复的回复" onClose={vi.fn()} />)
  const exportButton = (await screen.findAllByRole('button', { name: '导出 PNG' }, { timeout: 10000 }))[0]
  fireEvent.click(exportButton)
  await screen.findByText('图片渲染失败')
  expect(screen.getByRole('button', { name: '关闭卡片编辑器' })).toBeEnabled()
  expect(screen.getByRole('textbox', { name: '卡片 Markdown 正文' })).toHaveValue('可恢复的回复')
  fireEvent.click(exportButton)
  await waitFor(() => expect(saveImage).toHaveBeenCalledWith('data:image/png;base64,retry', 'card.png'))
})

it('retains normal autosaving when opened as the standalone tool', async () => {
  render(<MarkdownCardPage />)
  const editor = screen.getByRole('textbox', { name: '卡片 Markdown 正文' })
  expect(editor).toHaveValue('独立工具草稿')
  fireEvent.change(editor, { target: { value: '独立编辑的新草稿' } })
  await waitFor(() => expect(loadState().sourceText).toBe('独立编辑的新草稿'))
})
