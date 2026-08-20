import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
