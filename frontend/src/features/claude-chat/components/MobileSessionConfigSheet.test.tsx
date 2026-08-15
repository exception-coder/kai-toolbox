import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MobileSessionConfigSheet } from './MobileSessionConfigSheet'

afterEach(cleanup)

describe('MobileSessionConfigSheet', () => {
  it('以当前模型摘要打开会话配置 Sheet', async () => {
    render(
      <MobileSessionConfigSheet summary="GPT-5.6 Sol">
        <button type="button">切换服务商</button>
      </MobileSessionConfigSheet>,
    )

    const trigger = screen.getByRole('button', { name: '会话配置，当前 GPT-5.6 Sol' })
    expect(trigger).toHaveAttribute('title', '会话配置 · GPT-5.6 Sol')

    fireEvent.click(trigger)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('会话配置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '切换服务商' })).toBeInTheDocument()
  })

  it('规划锁定时禁用入口且不打开配置', () => {
    render(
      <MobileSessionConfigSheet summary="Codex" disabled>
        <span>配置内容</span>
      </MobileSessionConfigSheet>,
    )

    const trigger = screen.getByRole('button', { name: '会话配置，当前 Codex' })
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
