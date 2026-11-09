import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkbenchThemePicker, WorkbenchThemeDialog } from './WorkbenchThemePicker'
import { useState } from 'react'
import { useWorkbenchPageTheme, useWorkbenchTheme, readWorkbenchTheme, readWorkbenchMaterialStrength, setWorkbenchTheme, WORKBENCH_THEMES, ARTISTIC_SKINS, workbenchThemeStyle, type WorkbenchTheme } from '../lib/workbenchTheme'
import { ToolCallBubble } from './ToolCallBubble'
import { readFileSync } from 'node:fs'
import { SKIN_FAMILIES, skinFamily } from '../lib/artisticSkins'

const themeCss = readFileSync('src/features/claude-chat/styles/workbench-theme.css', 'utf8')

function chooseSkin(name: string) {
  const theme = WORKBENCH_THEMES.find(theme => theme.name === name)!
  const family = skinFamily(theme.id)
  fireEvent.click(screen.getByRole('button', { name: family?.name ?? name }))
  if (family) fireEvent.click(screen.getByRole('button', { name }))
}

it('previews without writing, trials on the real page and restores on back and unmount', () => {
  function Consumer() { const theme = useWorkbenchTheme(); return <Page theme={theme} /> }
  const view = render(<><Consumer /><WorkbenchThemePicker /></>)
  const draft = screen.getByRole('textbox', { name: '草稿' })
  fireEvent.change(draft, { target: { value: '不丢失草稿' } })
  chooseSkin('Butter Paper')
  expect(screen.getByText('外观预览 · 演示数据')).toBeInTheDocument()
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'tokyo-night')
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'butter-paper')
  expect(readWorkbenchTheme()).toBe('tokyo-night')
  fireEvent.change(screen.getByLabelText('材质强度'), { target: { value: '20' } })
  expect(document.documentElement.style.getPropertyValue('--wb-material-strength')).toBe('0.2')
  fireEvent.click(screen.getByRole('button', { name: '返回主题列表' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'tokyo-night')
  expect(screen.getByRole('button', { name: 'Atelier Paper' })).toHaveFocus()
  expect(draft).toHaveValue('不丢失草稿')
  chooseSkin('Aurora Glass')
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  view.unmount()
  render(<Consumer />)
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'tokyo-night')
})

it('saves skin and material strength atomically, preserves classic values and isolates accounts', () => {
  localStorage.setItem('forge.vibecoding.theme:7', 'nord')
  expect(readWorkbenchTheme(7)).toBe('nord')
  expect(readWorkbenchMaterialStrength(7)).toBe(0.6)
  setWorkbenchTheme('butter-paper', 8, 0.2)
  expect(readWorkbenchTheme(8)).toBe('butter-paper')
  expect(readWorkbenchMaterialStrength(8)).toBe(0.2)
  expect(readWorkbenchTheme(7)).toBe('nord')
  render(<WorkbenchThemePicker />)
  chooseSkin('Newsroom')
  fireEvent.change(screen.getByLabelText('材质强度'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  fireEvent.click(screen.getByRole('button', { name: '保存主题' }))
  expect(readWorkbenchTheme()).toBe('newsroom')
  expect(readWorkbenchMaterialStrength()).toBe(0)
  expect(screen.getByRole('button', { name: 'Editorial Press' })).toHaveAttribute('aria-pressed', 'true')
})

it('cancels trial with Escape, returns focus and leaves the persisted preference unchanged', async () => {
  const returnFocus = vi.fn()
  function Harness() {
    const [open, setOpen] = useState(true)
    const theme = useWorkbenchTheme()
    return <><Page theme={theme} /><WorkbenchThemeDialog open={open} onOpenChange={setOpen} returnFocus={returnFocus} /></>
  }
  render(<Harness />)
  chooseSkin('Phosphor Terminal')
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'phosphor-terminal')
  fireEvent.keyDown(document, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'tokyo-night')
  expect(returnFocus).toHaveBeenCalledOnce()
})

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
  fireEvent.click(screen.getByRole('button', { name: '保存主题' }))
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
  fireEvent.click(screen.getByRole('button', { name: '保存主题' }))
  expect(screen.getByRole('alert')).toHaveTextContent('主题未更改')
  fireEvent.click(screen.getByRole('button', { name: '返回主题列表' }))
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
  const blend = (base: string, ink: string, alpha: number) => '#' + [1, 3, 5].map(offset => Math.round(parseInt(base.slice(offset, offset + 2), 16) * (1 - alpha) + parseInt(ink.slice(offset, offset + 2), 16) * alpha).toString(16).padStart(2, '0')).join('')
  const textureInk: Record<string, [string, number]> = { 'atelier-paper': ['#705a36', .14], 'editorial-press': ['#23251f', .14], 'amber-crt': ['#f2c36b', .055], 'liquid-titanium': ['#e8f3ff', .09] }
  for (const { id, colors } of WORKBENCH_THEMES) {
    for (const text of [colors[5], colors[6]]) for (const surface of [colors[0], colors[1], colors[2], colors[3]]) expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(colors[7], colors[2])).toBeGreaterThanOrEqual(4.5)
    for (const content of [colors[7], colors[8], colors[9]]) {
      for (const surface of [colors[0], colors[1], colors[2]]) expect(contrast(content, surface)).toBeGreaterThanOrEqual(4.5)
    }
    if (textureInk[id]) {
      const [ink, alpha] = textureInk[id]!
      for (const surface of colors.slice(0, 4)) for (const content of colors.slice(5)) {
        expect(contrast(content, blend(surface, ink, alpha)), `${id} texture ${content}`).toBeGreaterThanOrEqual(4.5)
      }
      expect(contrast(colors[2], blend(colors[7], ink, alpha)), `${id} user / action`).toBeGreaterThanOrEqual(4.5)
    }
    for (const status of ['info', 'success', 'warning', 'danger']) {
      const occurrence = ['butter-paper', 'newsroom', 'atelier-paper', 'editorial-press'].includes(id) ? 2 : 1
      const color = themeCss.split(`--color-${status}:`)[occurrence]?.trim().slice(0, 7)
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
      for (const surface of [colors[0], colors[1], colors[2], colors[3]]) expect(contrast(color!, surface)).toBeGreaterThanOrEqual(4.5)
    }
  }
})

it('trials every artistic skin without replacing the draft and restores material tokens', () => {
  function Consumer() { const theme = useWorkbenchTheme(); return <Page theme={theme} /> }
  render(<><Consumer /><WorkbenchThemePicker /></>)
  const draft = screen.getByRole('textbox', { name: '草稿' })
  fireEvent.change(draft, { target: { value: '保留艺术皮肤切换前的输入' } })
  for (const skin of ARTISTIC_SKINS) {
    chooseSkin(skin.name)
    fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
    expect(document.documentElement).toHaveAttribute('data-workbench-theme', skin.id)
    expect(document.documentElement.style.getPropertyValue('--wb-surface-texture')).not.toBe('none')
    fireEvent.change(screen.getByLabelText('材质强度'), { target: { value: '0' } })
    expect(document.documentElement.style.getPropertyValue('--wb-surface-texture')).toBe('none')
    fireEvent.click(screen.getByRole('button', { name: '返回主题列表' }))
    expect(document.documentElement.style.getPropertyValue('--wb-surface-texture')).toBe('none')
    expect(screen.getByRole('textbox', { name: '草稿' })).toBe(draft)
    expect(draft).toHaveValue('保留艺术皮肤切换前的输入')
  }
  for (const { id } of WORKBENCH_THEMES) {
    const style = workbenchThemeStyle(id) as Record<string, string>
    expect(style['--wb-surface-texture']).toBeDefined()
    expect(style['--wb-panel-edge']).toBeDefined()
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

it('restores the latest stored choice after trial and reports a refused save without overwriting it', () => {
  function Consumer() { const theme = useWorkbenchTheme(); return <Page theme={theme} /> }
  render(<><Consumer /><WorkbenchThemePicker /></>)
  chooseSkin('Butter Paper')
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  localStorage.setItem('forge.vibecoding.theme:local', 'nord')
  fireEvent(window, new StorageEvent('storage', { key: 'forge.vibecoding.theme:local' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'butter-paper')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
  fireEvent.click(screen.getByRole('button', { name: '保存主题' }))
  expect(screen.getByRole('alert')).toHaveTextContent('主题未更改')
  expect(readWorkbenchTheme()).toBe('nord')
  fireEvent.click(screen.getByRole('button', { name: '恢复原主题' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'nord')
})

it('groups legacy skins without migrating preferences, updates a live variant and restores the default', () => {
  setWorkbenchTheme('newsroom', undefined, .3)
  function Consumer() { const theme = useWorkbenchTheme(); return <Page theme={theme} /> }
  const { container } = render(<><Consumer /><WorkbenchThemePicker /></>)
  expect(screen.queryByText('沉浸皮肤')).not.toBeInTheDocument()
  expect(container.querySelectorAll('.wb-theme-family')).toHaveLength(4)
  expect(screen.queryByRole('button', { name: 'Newsroom' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Editorial Press' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByLabelText('灰度比较'))
  expect(container.querySelectorAll('.wb-scene-grayscale')).toHaveLength(4)
  expect(readWorkbenchTheme()).toBe('newsroom')
  fireEvent.click(screen.getByRole('button', { name: 'Editorial Press' }))
  expect(screen.getByRole('button', { name: 'Newsroom' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.click(screen.getByRole('button', { name: '实时试用' }))
  fireEvent.click(screen.getByRole('button', { name: 'Editorial Press' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'editorial-press')
  expect(readWorkbenchTheme()).toBe('newsroom')
  fireEvent.click(screen.getByRole('button', { name: '返回主题列表' }))
  expect(document.documentElement).toHaveAttribute('data-workbench-theme', 'newsroom')
  fireEvent.click(screen.getByRole('button', { name: '恢复默认外观' }))
  expect(readWorkbenchTheme()).toBe('inherit')
  expect(document.documentElement).not.toHaveAttribute('data-workbench-theme')
})

it('resets every component texture and edge at zero strength and avoids material leaking into classic previews', () => {
  const textures = ['surface', 'canvas', 'message', 'user', 'code', 'tool', 'composer', 'panel', 'status'].map(name => `--wb-${name}-texture`)
  const edges = ['message', 'user', 'code', 'tool', 'panel', 'status'].map(name => `--wb-${name}-edge`)
  for (const family of SKIN_FAMILIES) for (const theme of family.variants) {
    const disabled = workbenchThemeStyle(theme, 0) as Record<string, string>
    for (const key of [...textures, ...edges, '--wb-material-shadow']) expect(disabled[key], `${theme}: ${key}`).toBe('none')
  }
  const classic = workbenchThemeStyle('nord') as Record<string, string>
  for (const key of textures) expect(classic[key], key).toBe('none')
})
