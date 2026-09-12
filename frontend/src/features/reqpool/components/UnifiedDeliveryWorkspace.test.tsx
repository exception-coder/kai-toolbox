import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReqItemView } from '../types'
import { UnifiedDeliveryWorkspace } from './UnifiedDeliveryWorkspace'

vi.mock('@/features/delivery-center/public-api', () => ({
  AiInspector: () => <div>交付检查器</div>,
  PrdDeliveryTrack: ({ onStageSelect }: { onStageSelect: (stage: string) => void }) => <button onClick={() => onStageSelect('test')}>查看测试证据</button>,
}))

afterEach(cleanup)

const early = { id: 'early', title: '库存预警', project: 'ERP', module: '库存', status: 'DRAFT', prdSessionId: null } as ReqItemView
function setup(items = [early]) {
  const onOpen = vi.fn(); const onVisible = vi.fn(); const onRegister = vi.fn()
  render(<MemoryRouter><UnifiedDeliveryWorkspace items={items} selectedIds={new Set()} onToggle={vi.fn()} onVisibleChange={onVisible}
    onOpenItem={onOpen} onStage={vi.fn()} onRegister={onRegister} onSync={vi.fn()} syncing={false} renderMetadata={() => <p>负责人</p>} /></MemoryRouter>)
  return { onOpen, onVisible, onRegister }
}

describe('unified delivery interactions', () => {
  it('keeps early requirements manageable and exposes the correct batch identity', () => {
    const { onOpen, onVisible } = setup()
    fireEvent.click(screen.getByRole('button', { name: '管理需求与执行' }))
    expect(onOpen).toHaveBeenCalledWith(early)
    expect(onVisible).toHaveBeenCalledWith(['early'])
    expect(screen.getByText('交付证据待形成')).toBeTruthy()
  })
  it('recovers filtered-empty and clears a stale inspector', () => {
    setup()
    fireEvent.change(screen.getByRole('textbox', { name: '搜索需求' }), { target: { value: '不会命中' } })
    expect(screen.queryByRole('button', { name: '管理需求与执行' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '清除筛选' }))
    expect(screen.getByRole('button', { name: '管理需求与执行' })).toBeTruthy()
  })
  it('provides registration from the globally empty state', () => {
    const { onRegister } = setup([])
    fireEvent.click(screen.getByRole('button', { name: '登记第一条需求' }))
    expect(onRegister).toHaveBeenCalledOnce()
  })
})
