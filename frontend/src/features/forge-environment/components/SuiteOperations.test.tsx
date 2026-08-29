import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SuiteOperations } from './SuiteOperations'

afterEach(cleanup)

describe('SuiteOperations', () => {
  const plugins = [
    { id: 'suite-team-standards', name: 'team-standards', version: 'Claude 2.1.0 · Codex 未装' },
  ]

  it('分别触发双端插件补装和套件更新', () => {
    const onInstall = vi.fn()
    const onUpdate = vi.fn()
    render(<SuiteOperations plugins={plugins} running={false} onInstall={onInstall} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: '补装 Claude 插件' }))
    fireEvent.click(screen.getByRole('button', { name: '补装 Codex 插件' }))
    fireEvent.click(screen.getByRole('button', { name: '一键安装全部套件' }))
    fireEvent.click(screen.getByRole('button', { name: '一键更新套件' }))

    expect(onInstall).toHaveBeenNthCalledWith(1, 'claude')
    expect(onInstall).toHaveBeenNthCalledWith(2, 'codex')
    expect(onInstall).toHaveBeenNthCalledWith(3, 'all')
    expect(onUpdate).toHaveBeenCalledOnce()
    expect(screen.getByText('Claude 2.1.0 · Codex 未装')).toBeInTheDocument()
  })

  it('执行期间禁止重复操作', () => {
    render(<SuiteOperations plugins={plugins} running onInstall={() => undefined} onUpdate={() => undefined} />)

    expect(screen.getByRole('button', { name: '补装 Claude 插件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '补装 Codex 插件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '一键安装全部套件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '一键更新套件' })).toBeDisabled()
  })
})
