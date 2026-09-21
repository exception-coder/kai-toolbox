import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodexSessionOptions } from './CodexSessionOptions'
import type { ModelInfo } from '../types'

const models: ModelInfo[] = [
  {
    value: 'gpt-5.6-terra',
    displayName: 'GPT-5.6-Terra',
    description: '',
    reasoningEfforts: ['low', 'medium'],
    defaultReasoningEffort: 'medium',
    fastSupported: true,
    isDefault: true,
  },
]

afterEach(cleanup)

function renderOptions(model: string | null, onModelChange = vi.fn(), modelDisabled = false) {
  render(
    <CodexSessionOptions
      models={models}
      model={model}
      reasoningEffort="low"
      speed="default"
      codexHome="C:\\Users\\zhang\\.codex-account-yx"
      modelDisabled={modelDisabled}
      onModelChange={onModelChange}
      onOptionsChange={vi.fn()}
      onRefreshModels={vi.fn()}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /配置 Codex 模型/ }))
  fireEvent.click(screen.getByRole('button', { name: /^模型 / }))
  return onModelChange
}

describe('CodexSessionOptions model Auth mismatch', () => {
  it('keeps the normal presentation when the selected model is in the catalog', () => {
    renderOptions('gpt-5.6-terra')

    expect(screen.queryByText(/不在当前 Auth 的可用目录中/)).not.toBeInTheDocument()
  })

  it('explains which Auth supplied a catalog that excludes the selected model', () => {
    renderOptions('gpt-5.6-sol')

    expect(screen.getByText('gpt-5.6-sol 不在当前 Auth 的可用目录中')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('codex-account-yx')
    expect(screen.getByText(/复制会话并选择目录/)).toBeInTheDocument()
  })

  it('only clears the persisted model after explicit recovery', () => {
    const onModelChange = renderOptions('gpt-5.6-sol')

    fireEvent.click(screen.getByRole('button', { name: '使用当前 Auth 默认模型' }))

    expect(onModelChange).toHaveBeenCalledWith('')
  })

  it('can lock only model selection while keeping reasoning options available', () => {
    render(
      <CodexSessionOptions
        models={models}
        model="gpt-5.6-terra"
        reasoningEffort="low"
        speed="default"
        modelDisabled
        onModelChange={vi.fn()}
        onOptionsChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /配置 Codex 模型/ }))

    expect(screen.getByRole('button', { name: /^模型 / })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^推理强度 / })).toBeEnabled()
  })

  it('confirms before creating a session on another Auth directory', () => {
    const onCodexHomeChange = vi.fn()
    render(
      <CodexSessionOptions
        models={models}
        model="gpt-5.6-terra"
        reasoningEffort="low"
        speed="default"
        codexHome="C:\\Users\\zhang\\.codex"
        codexHomes={['C:\\Users\\zhang\\.codex', 'C:\\Users\\zhang\\.codex-team']}
        showCodexHome
        onModelChange={vi.fn()}
        onOptionsChange={vi.fn()}
        onCodexHomeChange={onCodexHomeChange}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /配置 Codex 模型/ }))
    fireEvent.click(screen.getByRole('button', { name: '高级' }))
    fireEvent.click(screen.getByRole('button', { name: /Auth 目录/ }))
    fireEvent.click(screen.getByRole('button', { name: /codex-team/ }))

    expect(onCodexHomeChange).not.toHaveBeenCalled()
    expect(screen.getByText(/系统会保留当前会话/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '创建并切换' }))
    expect(onCodexHomeChange).toHaveBeenCalledWith('C:\\Users\\zhang\\.codex-team')
  })
})
