import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelConfigurationPicker, type ModelConfigurationSelection } from './ModelConfigurationPicker'
import { ClaudeUltracodeOption } from './ClaudeSessionOptions'
import type { Engine, ModelInfo } from '../types'

afterEach(cleanup)
const codexModels: ModelInfo[] = [
  { value: 'a', displayName: 'A', description: '', reasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'high', fastSupported: true },
  { value: 'b', displayName: 'B', description: '', reasoningEfforts: ['medium'], defaultReasoningEffort: 'medium', fastSupported: false },
]
const claudeModels: ModelInfo[] = [
  { value: 'opus', displayName: 'Opus', description: '', supportsEffort: true, supportedEffortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
]
function setup(engine: Engine, models: ModelInfo[], model: string, selection: ModelConfigurationSelection = { effort: 'high', speed: 'fast', ultracode: false }, gateway = false) {
  const onChange = vi.fn(), onEffortChange = vi.fn(), onSpeedChange = vi.fn(), onResetClaudeOptions = vi.fn(), onRefresh = vi.fn()
  render(<ModelConfigurationPicker engine={engine} engineLabel={engine} models={models} model={model}
    selection={selection} gateway={gateway} onChange={onChange} onEffortChange={onEffortChange}
    onSpeedChange={onSpeedChange} onResetClaudeOptions={onResetClaudeOptions} onRefresh={onRefresh} />)
  return { onChange, onEffortChange, onSpeedChange, onResetClaudeOptions, onRefresh }
}

describe('模型配置统一入口', () => {
  it('Codex 动态显示强度与速度，选项分别传递原生值', () => {
    const callbacks = setup('codex', codexModels, 'a')
    fireEvent.change(screen.getByRole('combobox', { name: '推理强度' }), { target: { value: 'low' } })
    fireEvent.change(screen.getByRole('combobox', { name: '速度模式' }), { target: { value: 'default' } })
    expect(callbacks.onEffortChange).toHaveBeenCalledWith('low')
    expect(callbacks.onSpeedChange).toHaveBeenCalledWith('default')
    expect(callbacks.onChange).not.toHaveBeenCalled()
  })

  it('Codex 切换不兼容模型先说明并确认强度和速度变化', () => {
    const callbacks = setup('codex', codexModels, 'a')
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'b' } })
    expect(callbacks.onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('推理强度调整为 中、速度调整为标准')
    fireEvent.click(screen.getByRole('button', { name: '确认切换' }))
    expect(callbacks.onChange).toHaveBeenCalledWith('b', { effort: 'medium', speed: 'default', ultracode: false })
  })

  it('目录刷新后不允许确认旧目录中的待切换模型', () => {
    const onChange = vi.fn()
    const props = { engine: 'codex' as const, engineLabel: 'Codex', model: 'a',
      selection: { effort: 'high', speed: 'fast' as const, ultracode: false }, gateway: false,
      onChange, onEffortChange: vi.fn(), onSpeedChange: vi.fn(), onResetClaudeOptions: vi.fn(), onRefresh: vi.fn() }
    const view = render(<ModelConfigurationPicker {...props} models={codexModels} />)
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'b' } })
    expect(screen.getByRole('button', { name: '确认切换' })).toBeVisible()
    view.rerender(<ModelConfigurationPicker {...props} models={[codexModels[0]]} />)
    expect(screen.queryByRole('button', { name: '确认切换' })).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('匹配 Claude 原生目录中的别名和已解析模型 ID', () => {
    const callbacks = setup('claude', [{ ...claudeModels[0], resolvedModel: 'claude-opus-full' }], 'claude-opus-full',
      { effort: 'auto', speed: 'default', ultracode: false })
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('claude-opus-full')
    fireEvent.change(screen.getByRole('combobox', { name: '推理强度' }), { target: { value: 'max' } })
    expect(callbacks.onEffortChange).toHaveBeenCalledWith('max')
  })

  it('Claude 用原生档位且不显示未适配的速度模式', () => {
    const callbacks = setup('claude', claudeModels, 'opus', { effort: 'auto', speed: 'default', ultracode: false })
    fireEvent.change(screen.getByRole('combobox', { name: '推理强度' }), { target: { value: 'max' } })
    expect(callbacks.onEffortChange).toHaveBeenCalledWith('max')
    expect(screen.queryByRole('combobox', { name: '速度模式' })).not.toBeInTheDocument()
  })

  it('能力变化后明确提供恢复强度的入口', () => {
    const callbacks = setup('claude', [{ value: 'small', displayName: 'Small', description: '', supportsEffort: false }],
      'small', { effort: 'max', speed: 'default', ultracode: true })
    expect(screen.queryByRole('combobox', { name: '推理强度' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('当前模型不支持已保存的强度')
    fireEvent.click(screen.getByRole('button', { name: '恢复自动' }))
    expect(callbacks.onResetClaudeOptions).toHaveBeenCalledOnce()
  })

  it('不会仅凭缺少 xhigh 就推断模型不支持 Ultracode', () => {
    const models: ModelInfo[] = [claudeModels[0],
      { value: 'other', displayName: 'Other', description: '', supportsEffort: true, supportedEffortLevels: ['high'] }]
    const callbacks = setup('claude', models, 'opus', { effort: 'high', speed: 'default', ultracode: true })
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'other' } })
    expect(callbacks.onChange).toHaveBeenCalledWith('other')
    expect(screen.queryByRole('button', { name: '确认切换' })).toBeNull()
  })

  it('未提供强度和速度能力的引擎只显示模型', () => {
    setup('pi', [{ value: 'p', displayName: 'Pi', description: '' }], 'p')
    expect(screen.getByRole('combobox', { name: '模型' })).toBeVisible()
    expect(screen.queryByRole('combobox', { name: '推理强度' })).toBeNull()
    expect(screen.queryByRole('combobox', { name: '速度模式' })).toBeNull()
  })

  it('Antigravity 通过原生模型变体表达强度，不写入 Codex 参数', () => {
    const models: ModelInfo[] = [
      { value: 'low', displayName: 'Gemini (Low)', description: '', reasoningEfforts: ['low'] },
      { value: 'high', displayName: 'Gemini (High)', description: '', reasoningEfforts: ['high'] },
    ]
    const callbacks = setup('antigravity', models, 'low', { effort: 'low', speed: 'default', ultracode: false })
    expect(screen.getByRole('combobox', { name: '推理强度' })).toBeDisabled()
    fireEvent.change(screen.getByRole('combobox', { name: '模型' }), { target: { value: 'high' } })
    expect(callbacks.onChange).toHaveBeenCalledWith('high')
    expect(callbacks.onEffortChange).not.toHaveBeenCalled()
    expect(callbacks.onSpeedChange).not.toHaveBeenCalled()
  })

  it('目录未核验时保留当前模型并提供刷新，而不猜测能力', () => {
    const callbacks = setup('codex', [], 'persisted')
    expect(screen.getByText('模型目录尚未加载，可重新同步。')).toBeVisible()
    expect(screen.getByRole('combobox', { name: '模型' })).toHaveValue('persisted')
    expect(screen.queryByRole('combobox', { name: '推理强度' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '重新同步 codex 模型' }))
    expect(callbacks.onRefresh).toHaveBeenCalledOnce()
  })

  it('模型未声明速度能力时保留原有快速选择，不当成不支持', () => {
    setup('codex', [{ value: 'unknown', displayName: 'Unknown', description: '',
      reasoningEfforts: ['high'], fastSupported: null }], 'unknown')
    expect(screen.queryByRole('combobox', { name: '速度模式' })).toBeNull()
    expect(screen.queryByText(/当前模型不支持已选的快速模式/)).toBeNull()
  })

  it('网关目录缺失时支持手填，不发送聊天消息', () => {
    const callbacks = setup('claude', [], 'old', { effort: 'auto', speed: 'default', ultracode: false }, true)
    fireEvent.change(screen.getByPlaceholderText('手填网关模型 ID'), { target: { value: 'new-model' } })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(callbacks.onChange).toHaveBeenCalledWith('new-model')
  })

  it('Ultracode 开关独立于强度，模型及工作流支持由引擎决定', () => {
    const change = vi.fn()
    const view = render(<ClaudeUltracodeOption options={{ effort: 'max', ultracode: false }} onChange={change} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Ultracode' }))
    expect(change).toHaveBeenCalledWith({ effort: 'max', ultracode: true })
    view.rerender(<ClaudeUltracodeOption options={{ effort: 'max', ultracode: true }} onChange={change} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Ultracode' }))
    expect(change).toHaveBeenLastCalledWith({ effort: 'max', ultracode: false })
  })
})
