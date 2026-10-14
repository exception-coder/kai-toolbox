import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ModelInfo } from '../../types'
import { CodexQuickPicker } from './CodexQuickPicker'

const models: ModelInfo[] = ['sol', 'astra', 'luna'].map(variant => ({
  value: `gpt-6.1-${variant}`, displayName: `GPT-6.1-${variant}`, description: '', reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
}))
afterEach(cleanup)

it('previews the combination during dragging and applies the model and effort once on release', () => {
  const apply = vi.fn()
  render(<CodexQuickPicker models={models} model="gpt-6.1-sol" effort="low" onApply={apply} onCustom={vi.fn()} />)
  const slider = screen.getByRole('slider', { name: '模型与思考强度组合' })
  expect(slider).toHaveAttribute('aria-valuetext', '6.1 Sol 轻度')
  fireEvent.pointerDown(slider)
  fireEvent.change(slider, { target: { value: '4' } })
  expect(slider).toHaveAttribute('aria-valuetext', '6.1 Astra 深入')
  expect(apply).not.toHaveBeenCalled()
  fireEvent.pointerUp(slider)
  fireEvent.blur(slider)
  expect(apply).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ model: 'gpt-6.1-astra', effort: 'high' }))
})

it('cancels an interrupted gesture and accepts keyboard confirmation and explicit stop selection', () => {
  const apply = vi.fn()
  render(<CodexQuickPicker models={models} model="gpt-6.1-sol" effort="low" onApply={apply} onCustom={vi.fn()} />)
  const slider = screen.getByRole('slider')
  fireEvent.change(slider, { target: { value: '5' } })
  fireEvent.pointerCancel(slider)
  fireEvent.blur(slider)
  expect(apply).not.toHaveBeenCalled()
  fireEvent.change(slider, { target: { value: '2' } })
  fireEvent.keyUp(slider, { key: 'ArrowRight' })
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'gpt-6.1-sol', effort: 'medium' }))
  fireEvent.click(screen.getByRole('button', { name: '选择 GPT-6.1-luna 轻度' }))
  expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'gpt-6.1-luna', effort: 'low' }))
})

it('preserves custom effort and only offers combinations advertised by the current catalog', () => {
  const apply = vi.fn(), custom = vi.fn()
  render(<CodexQuickPicker models={[{ ...models[0], reasoningEfforts: ['low'] }]} model="gpt-6.1-sol" effort="ultra" onApply={apply} onCustom={custom} />)
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '6.1 Sol 极致 · 自定义')
  expect(screen.getAllByRole('button', { name: /^选择 / })).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '自定义模型与参数' }))
  expect(custom).toHaveBeenCalledOnce()
  expect(apply).not.toHaveBeenCalled()
})

it('leaves customization accessible without catalog metadata and blocks stale selections during refresh', () => {
  const apply = vi.fn(), custom = vi.fn()
  const view = render(<CodexQuickPicker models={[]} model="custom-model" effort="max" onApply={apply} onCustom={custom} />)
  expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  expect(screen.getByText(/暂无已确认的快捷组合/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '自定义模型与参数' }))
  expect(custom).toHaveBeenCalledOnce()
  view.rerender(<CodexQuickPicker models={models} model="gpt-6.1-sol" effort="low" refreshing onApply={apply} onCustom={custom} />)
  expect(screen.getByRole('slider')).toBeDisabled()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  fireEvent.pointerUp(screen.getByRole('slider'))
  expect(apply).not.toHaveBeenCalled()
})

it('discards pending selection when the session configuration or catalog changes', () => {
  const apply = vi.fn()
  const view = render(<CodexQuickPicker models={models} model="gpt-6.1-sol" effort="low" onApply={apply} onCustom={vi.fn()} />)
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  view.rerender(<CodexQuickPicker models={models} model="gpt-6.1-astra" effort="medium" onApply={apply} onCustom={vi.fn()} />)
  fireEvent.pointerUp(screen.getByRole('slider'))
  expect(apply).not.toHaveBeenCalled()
  expect(screen.getByRole('slider')).toHaveAttribute('aria-valuetext', '6.1 Astra 标准 · 自定义')
})
