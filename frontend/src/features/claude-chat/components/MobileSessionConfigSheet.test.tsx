import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { compactMobileModelLabel, MobileSessionConfigSheet } from './MobileSessionConfigSheet'

afterEach(cleanup)

describe('MobileSessionConfigSheet', () => {
  it('以当前模型摘要打开会话配置 Sheet', async () => {
    render(
      <MobileSessionConfigSheet summary="GPT-5.6-Sol" compactSummary="5.6 Sol">
        <button type="button">切换服务商</button>
      </MobileSessionConfigSheet>,
    )

    const trigger = screen.getByRole('button', { name: '会话配置，当前 GPT-5.6-Sol' })
    expect(trigger).toHaveTextContent('5.6 Sol')
    expect(trigger).not.toHaveTextContent('GPT-5.6-Sol')
    expect(trigger).toHaveAttribute('title', '会话配置 · GPT-5.6-Sol')

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
    expect(trigger).toHaveTextContent('Codex')
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('只压缩已知 GPT 模型标签，未知模型保持原样', () => {
    expect(compactMobileModelLabel('GPT-5.6-Sol')).toBe('5.6 Sol')
    expect(compactMobileModelLabel('gpt-5.6-sol')).toBe('5.6 Sol')
    expect(compactMobileModelLabel('GPT-5.6 Codex')).toBe('5.6 Codex')
    expect(compactMobileModelLabel('Custom Model Alpha')).toBe('Custom Model Alpha')
  })
})
