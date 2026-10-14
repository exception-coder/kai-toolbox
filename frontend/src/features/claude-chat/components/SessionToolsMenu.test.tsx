import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Settings } from 'lucide-react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionToolItem, SessionToolSection, SessionToolsMenu } from './SessionToolsMenu'

afterEach(cleanup)

function MenuHarness({ onAction = () => undefined }: { onAction?: () => void }) {
  const [open, setOpen] = useState(false)
  const [sectionOpen, setSectionOpen] = useState(false)
  return (
    <SessionToolsMenu open={open} onOpenChange={setOpen}>
      <SessionToolSection
        icon={<Settings />}
        label="系统 · 设置"
        open={sectionOpen}
        onToggle={() => setSectionOpen(value => !value)}
      >
        <SessionToolItem icon={<Settings />} label="通知设置" onClick={onAction} nested />
      </SessionToolSection>
    </SessionToolsMenu>
  )
}

describe('SessionToolsMenu', () => {
  it('以独立操作入口打开分组菜单并执行命令', () => {
    const onAction = vi.fn()
    render(<MenuHarness onAction={onAction} />)

    const trigger = screen.getByRole('button', { name: '会话工具' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(trigger)
    expect(screen.getByRole('menu', { name: '会话工具' })).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(screen.getByRole('menuitem', { name: '系统 · 设置' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '通知设置' }))
    expect(onAction).toHaveBeenCalledOnce()
  })

  it('按 Escape 关闭菜单并把焦点还给入口', () => {
    render(<MenuHarness />)
    const trigger = screen.getByRole('button', { name: '会话工具' })
    fireEvent.click(trigger)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('menu', { name: '会话工具' })).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})

function CategoryHarness() {
  const [open, setOpen] = useState(false), [active, setActive] = useState<string | null>(null)
  return <SessionToolsMenu open={open} onOpenChange={next => { setOpen(next); if (next) setActive(null) }}
    activeGroupLabel={active ?? undefined} onBack={() => setActive(null)}>
    <div hidden><button>不可见的手机快捷操作</button></div>
    <SessionToolSection icon={<Settings />} label="阅读与显示" hint="外观与消息" open={active === '阅读与显示'} onToggle={() => setActive('阅读与显示')}>
      <SessionToolItem icon={<Settings />} label="专注模式" onClick={() => setOpen(false)} />
    </SessionToolSection>
    <SessionToolSection icon={<Settings />} label="运行与维护" open={active === '运行与维护'} onToggle={() => setActive('运行与维护')}>
      <SessionToolItem icon={<Settings />} label="最新日志" onClick={() => setOpen(false)} />
    </SessionToolSection>
    <SessionToolSection icon={<Settings />} label="会话与分享" disabled open={false} onToggle={() => setActive('会话与分享')}><p>不可用</p></SessionToolSection>
  </SessionToolsMenu>
}

it('navigates one category at a time, returns focus and skips unavailable categories by keyboard', async () => {
  render(<CategoryHarness />)
  const trigger = screen.getByRole('button', { name: '会话工具' })
  fireEvent.click(trigger)
  const reading = screen.getByRole('menuitem', { name: '阅读与显示' })
  await waitFor(() => expect(reading).toHaveFocus())
  expect(screen.getByRole('menuitem', { name: '会话与分享' })).toBeDisabled()
  fireEvent.keyDown(reading, { key: 'ArrowDown' })
  expect(screen.getByRole('menuitem', { name: '运行与维护' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(screen.getByRole('menuitem', { name: '运行与维护' })).toHaveFocus()
  fireEvent.click(reading)
  expect(screen.queryByRole('menuitem', { name: '运行与维护' })).not.toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: '专注模式' })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: '返回会话工具' })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByRole('menuitem', { name: '阅读与显示' })).toHaveFocus()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
})
