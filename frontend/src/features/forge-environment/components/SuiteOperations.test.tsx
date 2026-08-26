import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SuiteOperations } from './SuiteOperations'

afterEach(cleanup)

describe('SuiteOperations', () => {
  it('分别触发套件安装和更新', () => {
    const onInstall = vi.fn()
    const onUpdate = vi.fn()
    render(<SuiteOperations running={false} onInstall={onInstall} onUpdate={onUpdate} />)

    fireEvent.click(screen.getByRole('button', { name: '一键安装套件' }))
    fireEvent.click(screen.getByRole('button', { name: '一键更新套件' }))

    expect(onInstall).toHaveBeenCalledOnce()
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('执行期间禁止重复操作', () => {
    render(<SuiteOperations running onInstall={() => undefined} onUpdate={() => undefined} />)

    expect(screen.getByRole('button', { name: '一键安装套件' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '一键更新套件' })).toBeDisabled()
  })
})
