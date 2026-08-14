import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  UnifiedTitleBar,
  UnifiedTitleBarSlotContext,
  useUnifiedTitleBarSlot,
} from './UnifiedTitleBar'

vi.mock('./brand', () => ({
  useBrand: () => ({ brand: { appName: 'Forge', tagline: '' } }),
}))

vi.mock('./useMockMode', () => ({
  useMockMode: () => ({ enabled: false }),
}))

function FeatureTitlePortal({ children }: { children: ReactNode }) {
  const target = useUnifiedTitleBarSlot()
  return target ? createPortal(children, target) : children
}

function IntegratedTitleBarHarness({
  integrated,
  showTitleBar = true,
}: {
  integrated: boolean
  showTitleBar?: boolean
}) {
  const [slot, setSlot] = useState<HTMLDivElement | null>(null)

  return (
    <UnifiedTitleBarSlotContext.Provider value={integrated ? slot : null}>
      {showTitleBar && (
        <UnifiedTitleBar
          featureName="Vibe Coding"
          featureIntegrated={integrated}
          featureSlotRef={setSlot}
        />
      )}
      <FeatureTitlePortal>
        <div data-testid="feature-portal">当前开发会话</div>
      </FeatureTitlePortal>
    </UnifiedTitleBarSlotContext.Provider>
  )
}

afterEach(cleanup)

describe('UnifiedTitleBar feature slot', () => {
  it('非集成态展示当前功能名称', () => {
    render(
      <MemoryRouter>
        <UnifiedTitleBar featureName="Vibe Coding" />
      </MemoryRouter>,
    )

    expect(screen.getByText('Vibe Coding')).toBeInTheDocument()
  })

  it('集成态承载功能 Portal 且不重复渲染功能名称', () => {
    const { container } = render(
      <MemoryRouter>
        <IntegratedTitleBarHarness integrated />
      </MemoryRouter>,
    )

    const slot = container.querySelector('.unified-window-titlebar-feature')
    expect(slot).not.toBeNull()
    expect(slot).toContainElement(screen.getByTestId('feature-portal'))
    expect(screen.queryByText('Vibe Coding')).not.toBeInTheDocument()
    expect(screen.getAllByText('当前开发会话')).toHaveLength(1)
  })

  it('slot 卸载与集成态切换时把功能标题安全退回原位置', () => {
    const { container, rerender, unmount } = render(
      <MemoryRouter>
        <IntegratedTitleBarHarness integrated />
      </MemoryRouter>,
    )

    expect(container.querySelector('.unified-window-titlebar-feature'))
      .toContainElement(screen.getByTestId('feature-portal'))

    rerender(
      <MemoryRouter>
        <IntegratedTitleBarHarness integrated showTitleBar={false} />
      </MemoryRouter>,
    )

    expect(container.querySelector('.unified-window-titlebar-feature')).toBeNull()
    expect(screen.getByTestId('feature-portal')).toBeInTheDocument()
    expect(screen.getAllByText('当前开发会话')).toHaveLength(1)

    rerender(
      <MemoryRouter>
        <IntegratedTitleBarHarness integrated={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Vibe Coding')).toBeInTheDocument()
    expect(container.querySelector('.unified-window-titlebar-feature'))
      .not.toContainElement(screen.getByTestId('feature-portal'))
    expect(screen.getAllByText('当前开发会话')).toHaveLength(1)

    unmount()
    expect(screen.queryByTestId('feature-portal')).not.toBeInTheDocument()
  })

  it('移动导航与桌面侧栏按钮调用各自回调并提供正确名称', () => {
    const onOpenMobileMenu = vi.fn()
    const onToggleSidebar = vi.fn()
    const { rerender } = render(
      <MemoryRouter>
        <UnifiedTitleBar
          sidebarCollapsed={false}
          onOpenMobileMenu={onOpenMobileMenu}
          onToggleSidebar={onToggleSidebar}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
    expect(onOpenMobileMenu).toHaveBeenCalledOnce()
    expect(onToggleSidebar).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '收起侧栏' }))
    expect(onToggleSidebar).toHaveBeenCalledOnce()
    expect(onOpenMobileMenu).toHaveBeenCalledOnce()

    rerender(
      <MemoryRouter>
        <UnifiedTitleBar
          sidebarCollapsed
          onOpenMobileMenu={onOpenMobileMenu}
          onToggleSidebar={onToggleSidebar}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('button', { name: '打开导航' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '展开侧栏' })).toBeInTheDocument()
  })
})
