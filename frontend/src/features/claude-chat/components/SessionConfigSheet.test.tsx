import { StrictMode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { compactSessionModelLabel, SessionConfigSheet } from './SessionConfigSheet'
import { ModeSwitch } from './ModeSwitch'
import { CodexSessionOptions } from './CodexSessionOptions'
import { ProviderSwitch } from './ProviderSwitch'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    expect(trigger).toHaveTextContent('5.6 Sol')
    expect(screen.queryByText('会话配置 · 5.6 Sol')).not.toBeInTheDocument()
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

  it('mobile opens quick combinations first, custom stays in the same sheet and closing restores focus', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<SessionConfigSheet summary="GPT-6.1-Sol" quickSelection={custom => <button onClick={custom}>自定义组合</button>}>
      <button>完整模型配置</button>
    </SessionConfigSheet>)
    const trigger = screen.getByRole('button', { name: '会话配置，当前 GPT-6.1-Sol' })
    trigger.focus(); fireEvent.click(trigger)
    expect(screen.getByRole('heading', { name: 'Codex 模型选择' })).toBeVisible()
    expect(screen.queryByRole('button', { name: '完整模型配置' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '自定义组合' }))
    expect(screen.getByRole('button', { name: '完整模型配置' })).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '返回快捷组合' }))
    expect(screen.getByRole('button', { name: '自定义组合' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it('desktop retains complete configuration even when mobile quick combinations are available', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    render(<SessionConfigSheet summary="Codex" quickSelection={() => <p>快捷组合</p>}><button>完整模型配置</button></SessionConfigSheet>)
    fireEvent.click(screen.getByRole('button', { name: '会话配置，当前 Codex' }))
    expect(screen.getByRole('button', { name: '完整模型配置' })).toBeVisible()
    expect(screen.queryByText('快捷组合')).not.toBeInTheDocument()
  })

  it('retains an open configuration after its menu trigger disappears and restores the visible control', async () => {
    const target = document.createElement('div')
    document.body.append(target)
    const onOpen = vi.fn(), onReturnFocus = vi.fn()
    const view = render(<SessionConfigSheet summary="Codex" triggerContainer={target} onOpen={onOpen} onReturnFocus={onReturnFocus}>
      <button>配置内容</button>
    </SessionConfigSheet>)
    fireEvent.click(screen.getByRole('button', { name: '会话配置，当前 Codex' }))
    expect(onOpen).toHaveBeenCalledOnce()
    view.rerender(<SessionConfigSheet summary="Codex" triggerContainer={null} onReturnFocus={onReturnFocus}><button>配置内容</button></SessionConfigSheet>)
    target.remove()
    expect(screen.getByRole('button', { name: '配置内容' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(onReturnFocus).toHaveBeenCalledOnce())
  })
})
