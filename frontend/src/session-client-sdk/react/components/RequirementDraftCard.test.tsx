import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { RequirementDraftCard } from './RequirementDraftCard'
const draft = { title: '筛选逾期', kind: '需求' as const, summary: '增加逾期筛选', current: '无筛选', expected: '支持筛选', scope: '借用列表', acceptance: ['结果正确'], evidence: [], questions: [] }
it('requires explicit replacement and resets confirmation after editing', () => {
 const view = render(<RequirementDraftCard source={draft} />)
 fireEvent.click(screen.getByRole('button', {name:'载入助手草稿'}))
 fireEvent.click(screen.getByRole('button', {name:'确认草稿'}))
 expect(screen.getByText('已确认，仅标记草稿；尚未提交开发。')).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('标准需求描述'), {target:{value:'我的修订'}})
 expect(screen.getByRole('button', {name:'确认草稿'})).toBeInTheDocument()
 view.rerender(<RequirementDraftCard source={{...draft,summary:'新的助手稿'}} />)
 expect(screen.getByLabelText('标准需求描述')).toHaveValue('我的修订')
 fireEvent.click(screen.getByRole('button', {name:'载入助手新草稿（替换当前编辑）'}))
 expect(screen.getByLabelText('标准需求描述')).toHaveValue('新的助手稿')
})
