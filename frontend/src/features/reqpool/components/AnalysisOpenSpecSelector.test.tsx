import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalysisOpenSpecSelector } from './AnalysisOpenSpecSelector'

afterEach(cleanup)

describe('AnalysisOpenSpecSelector', () => {
  const base = { loading: false, error: false, disabled: false, onSelect: vi.fn(), onRefresh: vi.fn() }
  it('displays an automatically selected project plan without manual input', () => {
    render(<AnalysisOpenSpecSelector {...base} selected="add-export" discovery={{ state: 'READY', changeIds: ['add-export'], selectedChange: 'add-export', message: '已自动关联' }} />)
    expect(screen.getByRole('combobox')).toHaveValue('add-export')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText(/openspec\/changes\/add-export\/tasks.md/)).toBeInTheDocument()
  })
  it('lets users choose among multiple candidates', () => {
    render(<AnalysisOpenSpecSelector {...base} selected="" discovery={{ state: 'READY', changeIds: ['first', 'second'], selectedChange: null, message: '请选择' }} />)
    expect(screen.getByRole('combobox')).toHaveValue('')
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'second' } })
    expect(base.onSelect).toHaveBeenCalledWith('second')
  })
  it('offers retry on failure and keeps an invalid selection explicit', () => {
    const { rerender } = render(<AnalysisOpenSpecSelector {...base} selected="" error />)
    expect(screen.getByRole('alert')).toHaveTextContent('读取计划失败')
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(base.onRefresh).toHaveBeenCalledOnce()
    rerender(<AnalysisOpenSpecSelector {...base} selected="removed" discovery={{ state: 'EMPTY', changeIds: [], selectedChange: null, message: '无计划' }} />)
    expect(screen.getByText(/原关联变更已不可用/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '清除失效关联' }))
    expect(base.onSelect).toHaveBeenCalledWith('')
  })
})
