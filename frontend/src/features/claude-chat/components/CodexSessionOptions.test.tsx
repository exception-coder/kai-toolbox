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

function renderOptions(model: string | null, onModelChange = vi.fn()) {
  render(
    <CodexSessionOptions
      models={models}
      model={model}
      reasoningEffort="low"
      speed="default"
      codexHome="C:\\Users\\zhang\\.codex-account-yx"
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
})
