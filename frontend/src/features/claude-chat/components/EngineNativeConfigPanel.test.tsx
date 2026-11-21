import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { EngineNativeConfig } from '../api'

const auth = vi.hoisted(() => ({ roles: ['ADMIN'] as string[] }))
const api = vi.hoisted(() => ({ get: vi.fn(), apply: vi.fn() }))
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { roles: auth.roles } }) }))
vi.mock('../api', () => ({ getEngineNativeConfig: api.get, applyEngineNativeConfig: api.apply }))

import { describeEngineConfig, EngineNativeConfigPanel } from './EngineNativeConfigPanel'

function row(engine: string, label: string, overrides: Partial<EngineNativeConfig> = {}): EngineNativeConfig {
  return { engine, label, configured: true, provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro',
    keyHint: '…cb67', supportsCustom: true, takesEffect: '下一轮对话', configPath: `/home/${engine}`, note: null, ...overrides }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}><EngineNativeConfigPanel onClose={vi.fn()} /></QueryClientProvider>)
}

afterEach(() => { cleanup(); vi.clearAllMocks(); auth.roles = ['ADMIN'] })

describe('EngineNativeConfigPanel', () => {
  it('summarises the current provider, model and only the key suffix', () => {
    expect(describeEngineConfig(row('qwen', 'Qwen Code'))).toBe('DeepSeek · deepseek-v4-pro · Key …cb67')
    expect(describeEngineConfig(row('qwen', 'Qwen Code', { configured: false, provider: null, model: null, keyHint: null }))).toBe('未配置')
    expect(describeEngineConfig(row('oc', 'OpenCode', { provider: 'openai-compatible', baseUrl: 'https://llm.example.com/v1' })))
      .toBe('llm.example.com · deepseek-v4-pro · Key …cb67')
  })

  it('applies to all selected engines and keeps the existing key when the key field is blank', async () => {
    api.get.mockResolvedValue([row('qwen', 'Qwen Code'), row('pi', 'Pi', { supportsCustom: false })])
    api.apply.mockResolvedValue({ applied: ['qwen', 'pi'], failures: [], engines: [row('qwen', 'Qwen Code'), row('pi', 'Pi', { supportsCustom: false })] })
    renderPanel()

    fireEvent.click(await screen.findByRole('button', { name: '应用到所选引擎（2）' }))

    await waitFor(() => expect(api.apply).toHaveBeenCalled())
    expect(api.apply.mock.calls[0][0]).toEqual({ engines: ['qwen', 'pi'], provider: 'deepseek', model: 'deepseek-v4-pro' })
    expect(await screen.findByText(/已更新 2 个引擎/)).toBeTruthy()
  })

  it('a custom OpenAI-compatible service excludes DeepSeek-only engines and needs a base URL', async () => {
    api.get.mockResolvedValue([row('qwen', 'Qwen Code'), row('pi', 'Pi', { supportsCustom: false })])
    renderPanel()
    await screen.findByRole('button', { name: '应用到所选引擎（2）' })

    fireEvent.click(screen.getByRole('radio', { name: 'OpenAI 兼容服务' }))

    expect((screen.getByLabelText('应用到 Pi') as HTMLInputElement).disabled).toBe(true)
    expect(screen.getByText('仅支持 DeepSeek')).toBeTruthy()
    const submit = screen.getByRole('button', { name: '应用到所选引擎（1）' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
    fireEvent.change(screen.getByPlaceholderText('https://example.com/v1'), { target: { value: 'https://llm.example.com/v1' } })
    fireEvent.change(screen.getByPlaceholderText('服务商提供的模型 ID'), { target: { value: 'my-model' } })
    expect(submit.disabled).toBe(false)
  })

  it('non-admins see why it is unavailable and never load machine config', () => {
    auth.roles = []
    renderPanel()
    expect(screen.getByText(/仅管理员可查看和修改/)).toBeTruthy()
    expect(api.get).not.toHaveBeenCalled()
  })
})
