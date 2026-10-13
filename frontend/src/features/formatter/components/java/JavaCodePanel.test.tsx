import { forwardRef, useImperativeHandle, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { JavaFormatResult } from '../../lib/java/contracts'
import { JavaCodePanel } from './JavaCodePanel'

const worker = vi.hoisted(() => ({ run: vi.fn(), cancel: vi.fn() }))
vi.mock('../../lib/java/JavaFormatClient', () => ({ JavaFormatClient: class { run = worker.run; cancel = worker.cancel } }))
vi.mock('../CodeEditor', () => ({
  CodeEditor: forwardRef(({ ariaLabel, readOnly, onChange }: { ariaLabel: string; readOnly?: boolean; onChange?: (value: string) => void }, ref) => {
    const [value, setValue] = useState('')
    useImperativeHandle(ref, () => ({ getValue: () => value, setValue, focusAt: vi.fn() }), [value])
    return <textarea aria-label={ariaLabel} readOnly={readOnly} value={value} onChange={event => { setValue(event.target.value); onChange?.(event.target.value) }} />
  }),
}))
beforeEach(() => { worker.run.mockReset(); worker.cancel.mockReset(); vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } }) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
const input = () => screen.getByLabelText('Java 代码输入')
const output = () => screen.getByLabelText('Java 格式化结果') as HTMLTextAreaElement
const format = () => fireEvent.click(screen.getByRole('button', { name: '格式化' }))

describe('Java 代码阅读与恢复', () => {
  it('格式化保留原文，复制有效结果；编辑原文立即让旧结果失效', async () => {
    worker.run.mockResolvedValue({ ok: true, output: 'void f() {\n    call();\n}', kind: '方法 / 接口成员' })
    render(<JavaCodePanel />)
    fireEvent.change(input(), { target: { value: 'void f(){call();}' } })
    fireEvent.keyDown(input(), { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(screen.getByRole('button', { name: '复制结果' })).toBeEnabled())
    expect(input()).toHaveValue('void f(){call();}')
    fireEvent.click(screen.getByRole('button', { name: '复制结果' }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(output().value))
    fireEvent.change(input(), { target: { value: 'void next(){}' } })
    expect(screen.getByRole('button', { name: /复制/ })).toBeDisabled()
    expect(output().value).toContain('call();')
    expect(screen.getByText('上一份结果 · 请重新格式化')).toBeTruthy()
  })
  it('计算中输入或选项改变，迟到结果不会覆盖当前视图', async () => {
    let resolve!: (result: JavaFormatResult) => void
    worker.run.mockImplementation(() => new Promise<JavaFormatResult>(finish => { resolve = finish }))
    render(<JavaCodePanel />)
    fireEvent.change(input(), { target: { value: 'first()' } }); format()
    fireEvent.change(screen.getByLabelText('Java 缩进'), { target: { value: '2' } })
    fireEvent.change(input(), { target: { value: 'second()' } })
    await act(async () => resolve({ ok: true, output: 'first()', kind: '表达式' }))
    expect(output()).toHaveValue('')
    expect(input()).toHaveValue('second()')
    expect(screen.getByRole('button', { name: '格式化' })).toBeEnabled()
  })
  it('语法失败保留上一份结果，剪贴板失败提供手动复制', async () => {
    worker.run.mockResolvedValueOnce({ ok: true, output: 'call()', kind: '表达式' })
    render(<JavaCodePanel />)
    fireEvent.change(input(), { target: { value: 'call()' } }); format()
    await waitFor(() => expect(screen.getByRole('button', { name: '复制结果' })).toBeEnabled())
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied'))
    fireEvent.click(screen.getByRole('button', { name: '复制结果' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('请用 Ctrl/⌘+C'))
    worker.run.mockResolvedValueOnce({ ok: false, error: '请检查括号，原文已保留。', position: 0 })
    fireEvent.change(input(), { target: { value: 'call(' } }); format()
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('请检查括号'))
    expect(input()).toHaveValue('call('); expect(output()).toHaveValue('call()')
    expect(screen.getByRole('button', { name: '复制结果' })).toBeDisabled()
  })
})
