import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PwaInstallPrompt } from './PwaInstallPrompt'

vi.mock('./brand', () => ({
  useBrand: () => ({ brand: { appName: 'Forge', tagline: '' } }),
}))

const originalMatchMediaDescriptor = Object.getOwnPropertyDescriptor(window, 'matchMedia')

function installDisplayMode(activeMode: string | null): ReturnType<typeof vi.fn> {
  const matchMedia = vi.fn((query: string) => ({
    matches: activeMode !== null && query === `(display-mode: ${activeMode})`,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  })
  return matchMedia
}

function dispatchInstallPrompt(): void {
  const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    platforms: ['web'],
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
  })
  act(() => window.dispatchEvent(event))
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  if (originalMatchMediaDescriptor) {
    Object.defineProperty(window, 'matchMedia', originalMatchMediaDescriptor)
  } else {
    delete (window as unknown as { matchMedia?: unknown }).matchMedia
  }
})

describe('PwaInstallPrompt display mode', () => {
  it('在 Window Controls Overlay 安装态不再展示安装提示', () => {
    const matchMedia = installDisplayMode('window-controls-overlay')
    render(<PwaInstallPrompt />)

    dispatchInstallPrompt()

    expect(matchMedia).toHaveBeenCalledWith('(display-mode: window-controls-overlay)')
    expect(screen.queryByRole('dialog', { name: '安装应用' })).not.toBeInTheDocument()
  })

  it('在普通浏览器模式仍响应安装事件', () => {
    installDisplayMode(null)
    render(<PwaInstallPrompt />)

    dispatchInstallPrompt()

    expect(screen.getByRole('dialog', { name: '安装应用' })).toBeInTheDocument()
  })
})
