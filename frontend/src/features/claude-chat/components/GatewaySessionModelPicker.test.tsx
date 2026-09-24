import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GatewaySessionModelPicker } from './GatewaySessionModelPicker'

afterEach(cleanup)

describe('GatewaySessionModelPicker', () => {
  it('selects a model from the current gateway catalog and refreshes in place', () => {
    const onChange = vi.fn()
    const onRefresh = vi.fn()
    render(<GatewaySessionModelPicker
      models={[{ value: 'deepseek-flash', displayName: 'DeepSeek Flash', description: '' }]}
      currentModel={null}
      refreshing={false}
      disabled={false}
      onChange={onChange}
      onRefresh={onRefresh}
    />)
    fireEvent.change(screen.getByLabelText('网关模型'), { target: { value: 'deepseek-flash' } })
    fireEvent.click(screen.getByRole('button', { name: '重新同步网关模型' }))
    expect(onChange).toHaveBeenCalledWith('deepseek-flash')
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('preserves an unverified current model and explains recovery when catalog is empty', () => {
    const onChange = vi.fn()
    render(<GatewaySessionModelPicker
      models={[]}
      currentModel="custom-model"
      refreshing={false}
      disabled={false}
      onChange={onChange}
      onRefresh={vi.fn()}
    />)
    expect(screen.getByLabelText('网关模型')).toHaveProperty('value', 'custom-model')
    expect(screen.getByText(/手填不能绕过认证/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '应用' })).toHaveProperty('disabled', true)
    fireEvent.change(screen.getByLabelText('网关模型'), { target: { value: 'new-model' } })
    fireEvent.click(screen.getByRole('button', { name: '应用' }))
    expect(onChange).toHaveBeenCalledWith('new-model')
  })
})
