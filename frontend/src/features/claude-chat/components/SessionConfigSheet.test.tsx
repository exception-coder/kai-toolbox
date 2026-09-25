import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { compactSessionModelLabel, SessionConfigSheet } from './SessionConfigSheet'
import { ModeSwitch } from './ModeSwitch'
import { CodexSessionOptions } from './CodexSessionOptions'
import { ProviderSwitch } from './ProviderSwitch'

afterEach(cleanup)

describe('SessionConfigSheet', () => {
  it('Codex 会话的实际配置控件打开时不触发重复更新', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <StrictMode><QueryClientProvider client={client}>
        <SessionConfigSheet summary="GPT-5.6-Sol">
          <ModeSwitch engine="codex" mode="default" onChange={() => {}} inlineConfirmation />
          <CodexSessionOptions
            models={[]} model="gpt-5.6-sol" reasoningEffort="low" speed="default"
            onModelChange={() => {}} onOptionsChange={() => {}}
          />
          <ProviderSwitch engine="codex" providerKind="official" providerBaseUrl={null} onSwitch={() => {}} hideManage />
        </SessionConfigSheet>
      </QueryClientProvider></StrictMode>,
    )

    fireEvent.click(screen.getByRole('button', { name: '会话配置，当前 GPT-5.6-Sol' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /配置 Codex 模型/ })).toBeInTheDocument()
  })
  it('以同一入口打开完整会话配置', async () => {
    render(
      <SessionConfigSheet summary="GPT-5.6-Sol" compactSummary="5.6 Sol">
        <button type="button">权限模式</button>
        <button type="button">模型参数</button>
        <button type="button">服务商</button>
      </SessionConfigSheet>,
    )

    const trigger = screen.getByRole('button', { name: '会话配置，当前 GPT-5.6-Sol' })
    expect(screen.getByText('5.6 Sol')).toBeInTheDocument()
    expect(screen.getByText('会话配置 · 5.6 Sol')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('title', '会话配置 · GPT-5.6-Sol')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: '权限模式' })).not.toBeInTheDocument()

    trigger.focus()
    fireEvent.click(trigger)

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('会话配置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '权限模式' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '模型参数' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '服务商' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('锁定时禁用入口且不打开配置', () => {
    render(
      <SessionConfigSheet summary="Codex" disabled>
        <span>配置内容</span>
      </SessionConfigSheet>,
    )

    const trigger = screen.getByRole('button', { name: '会话配置，当前 Codex' })
    expect(trigger).toHaveTextContent('Codex')
    expect(trigger).toBeDisabled()
    fireEvent.click(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('只压缩已知 GPT 模型标签，未知模型保持原样', () => {
    expect(compactSessionModelLabel('GPT-5.6-Sol')).toBe('5.6 Sol')
    expect(compactSessionModelLabel('gpt-5.6-sol')).toBe('5.6 Sol')
    expect(compactSessionModelLabel('GPT-5.6 Codex')).toBe('5.6 Codex')
    expect(compactSessionModelLabel('Custom Model Alpha')).toBe('Custom Model Alpha')
  })
})
