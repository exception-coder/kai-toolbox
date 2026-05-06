import type { Theme } from '../types'

export const THEMES: ReadonlyArray<{ id: Theme; label: string; preview: string }> = [
  { id: 'minimal', label: '极简', preview: '#ffffff' },
  { id: 'dark', label: '深色', preview: '#1a1a1a' },
  { id: 'xiaohongshu', label: '小红书', preview: '#fff3f1' },
  { id: 'zhihu', label: '知乎专栏', preview: '#f6f6f6' },
  { id: 'terminal', label: '终端', preview: '#0b0f17' },
]

export function getThemeAttr(theme: Theme): { 'data-md-theme': Theme } {
  return { 'data-md-theme': theme }
}
