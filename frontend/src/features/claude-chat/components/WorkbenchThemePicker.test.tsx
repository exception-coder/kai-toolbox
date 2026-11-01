import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkbenchThemePicker, WorkbenchThemeDialog } from './WorkbenchThemePicker'
import { useState } from 'react'
import { useWorkbenchPageTheme, useWorkbenchTheme, readWorkbenchTheme, setWorkbenchTheme, WORKBENCH_THEMES, type WorkbenchTheme } from '../lib/workbenchTheme'
import { ToolCallBubble } from './ToolCallBubble'
import { readFileSync } from 'node:fs'

const themeCss = readFileSync('src/features/claude-chat/styles/workbench-theme.css', 'utf8')

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); document.documentElement.removeAttribute('data-workbench-theme'); document.documentElement.style.cssText = '' })

function Page({ theme }: { theme: WorkbenchTheme }) {
  useWorkbenchPageTheme(theme)
  return <input aria-label="草稿" defaultValue="保留这个任务" />
}

it('switches the shared browser preference without resetting draft or expanded tool state', () => {
  localStorage.setItem('kai-toolbox:claude-chat:skin', '1')
  localStorage.setItem('kai-toolbox:claude-chat:tool-colors', '1')
  function Consumer() { const theme = useWorkbenchTheme(); return <><Page theme={theme} /><output>{theme}</output><ToolCallBubble toolName="Bash" input={{ command: 'git status' }} output="完成" /></> }
  const view = render(<><Consumer /><WorkbenchThemePicker /></>)
  const draft = screen.getByRole('textbox', { name: '草稿' })
  fireEvent.change(draft, { target: { value: '新的草稿' } })
  fireEvent.click(screen.getByRole('button', { name: /命令.*Bash/ }))
  expect(screen.getByText(/git status/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Nord' }))
  expect(screen.getByRole('button', { name: 'Nord' })).toHaveAttribute('aria-pressed', 'true')
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'nord')
  expect(screen.getByRole('textbox', { name: '草稿' })).toBe(draft)
  expect(draft).toHaveValue('新的草稿')
  expect(screen.getByText(/git status/)).toBeInTheDocument()
  view.unmount()
  render(<WorkbenchThemePicker />)
  expect(screen.getByRole('button', { name: 'Nord' })).toHaveAttribute('aria-pressed', 'true')
})

it('isolates account preferences and responds to changes from another tab', () => {
  setWorkbenchTheme('nord', 7)
  expect(readWorkbenchTheme(7)).toBe('nord')
  expect(readWorkbenchTheme(8)).toBe('tokyo-night')
  render(<WorkbenchThemePicker />)
  localStorage.setItem('forge.vibecoding.theme:local', 'catppuccin')
  fireEvent(window, new StorageEvent('storage', { key: 'forge.vibecoding.theme:local' }))
  expect(screen.getByRole('button', { name: 'Catppuccin' })).toHaveAttribute('aria-pressed', 'true')
})

it('restores only its own page scope and leaves global appearance and motion intact', () => {
  const root = document.documentElement
  root.style.setProperty('--wb-text', 'original-text')
  root.style.setProperty('--unrelated', 'keep')
  root.dataset.reduceMotion = 'true'
  const view = render(<Page theme="tokyo-night" />)
  view.rerender(<Page theme="nord" />)
  view.rerender(<Page theme="inherit" />)
  expect(root).not.toHaveAttribute('data-workbench-theme')
  expect(root.style.getPropertyValue('--wb-text')).toBe('original-text')
  expect(root.style.getPropertyValue('--unrelated')).toBe('keep')
  expect(root.dataset.reduceMotion).toBe('true')
  delete root.dataset.reduceMotion
})

it('keeps the previous theme and reports storage failures', () => {
  render(<WorkbenchThemePicker />)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  fireEvent.click(screen.getByRole('button', { name: 'Nord' }))
  expect(screen.getByRole('alert')).toHaveTextContent('主题未更改')
  expect(screen.getByRole('button', { name: 'Tokyo Night' })).toHaveAttribute('aria-pressed', 'true')
})

it('closes the theme dialog with Escape and restores the supplied workbench trigger', async () => {
  const returnFocus = vi.fn()
  function DialogHarness() {
    const [open, setOpen] = useState(true)
    return <WorkbenchThemeDialog open={open} onOpenChange={setOpen} returnFocus={returnFocus} />
  }
  render(<DialogHarness />)
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(returnFocus).toHaveBeenCalledTimes(1)
})

it('keeps primary and secondary text legible across each palette surface', () => {
  const luminance = (hex: string) => {
    const rgb = hex.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
  }
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05)
  for (const { colors } of WORKBENCH_THEMES) {
    for (const text of [colors[5], colors[6]]) for (const surface of [colors[0], colors[1], colors[2], colors[3]]) expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors[7], colors[2])).toBeGreaterThanOrEqual(4.5)
    for (const status of ['info', 'success', 'warning', 'danger']) {
      const color = themeCss.split(`--color-${status}:`)[1]?.trim().slice(0, 7)
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      for (const surface of [colors[0], colors[1], colors[2], colors[3]]) expect(contrast(color!, surface)).toBeGreaterThanOrEqual(4.5)
    }
  }
})

it('shows an error even when the failed tool has no output and keeps type labels neutral', () => {
  const view = render(<ToolCallBubble toolName="mcp__forge__execute_resource" input={{}} isError />)
  expect(screen.getByRole('status')).toHaveTextContent('出错')
  expect(screen.getByText('MCP')).toBeInTheDocument()
  view.rerender(<ToolCallBubble toolName="Read" input={{}} />)
  expect(screen.getByRole('status')).toHaveTextContent('运行中')
  view.rerender(<ToolCallBubble toolName="Read" input={{}} output="文件内容" />)
  expect(screen.getByRole('status')).toHaveTextContent('完成')
})
