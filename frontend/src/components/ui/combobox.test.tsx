import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Combobox } from './combobox'

afterEach(cleanup)
const options = [{ value: 'DEV', label: 'DEV · 开发' }, { value: 'TEST', label: 'TEST · 测试' }, { value: 'UAT', label: 'UAT · 验收' }]

it('retains free text input for existing editable consumers', () => {
  const change = vi.fn()
  render(<Combobox aria-label="项目名称" value="" onChange={change} options={options} />)
  const input = screen.getByLabelText('项目名称')
  expect(input.tagName).toBe('INPUT')
  fireEvent.change(input, { target: { value: '自定义项目' } })
  expect(change).toHaveBeenCalledWith('自定义项目')
})

it('shows all fixed choices, supports arrow navigation and restores focus after selection', async () => {
  const change = vi.fn()
  render(<Combobox allowCustom={false} aria-label="环境" value="TEST" onChange={change} options={options} />)
  const trigger = screen.getByRole('combobox', { name: '环境' })
  expect(trigger.tagName).toBe('BUTTON')
  fireEvent.click(trigger)
  const selected = await screen.findByRole('option', { name: 'TEST · 测试' })
  expect(screen.getAllByRole('option')).toHaveLength(3)
  expect(selected).toHaveAttribute('aria-selected', 'true')
  await waitFor(() => expect(selected).toHaveFocus())
  fireEvent.keyDown(selected, { key: 'ArrowDown' })
  const uat = screen.getByRole('option', { name: 'UAT · 验收' })
  expect(uat).toHaveFocus()
  fireEvent.keyDown(uat, { key: 'Home' })
  expect(screen.getByRole('option', { name: 'DEV · 开发' })).toHaveFocus()
  fireEvent.keyDown(document.activeElement!, { key: 'End' })
  expect(uat).toHaveFocus()
  fireEvent.click(uat)
  expect(change).toHaveBeenCalledWith('UAT')
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  await waitFor(() => expect(trigger).toHaveFocus())
})

it('keeps legacy values visible and respects disabled controls and inherited fieldsets', async () => {
  const change = vi.fn()
  const ui = (disabled: boolean) => <fieldset disabled={disabled}><Combobox allowCustom={false} aria-label="环境" value="OLD-QA" options={options} onChange={change} /></fieldset>
  const view = render(ui(false))
  const trigger = screen.getByRole('combobox', { name: '环境' })
  expect(trigger).toHaveTextContent('OLD-QA · 历史值')
  expect(change).not.toHaveBeenCalled()
  fireEvent.click(trigger)
  const dev = await screen.findByRole('option', { name: 'DEV · 开发' })
  view.rerender(ui(true))
  fireEvent.click(dev)
  expect(change).not.toHaveBeenCalled()
  expect(trigger).toBeDisabled()
})
