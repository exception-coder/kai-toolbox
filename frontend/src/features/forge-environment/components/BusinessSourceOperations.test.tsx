import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BusinessSourceOperations } from './BusinessSourceOperations'
import type { BusinessSystemWorkspace } from '../types'

const systems: BusinessSystemWorkspace[] = [{
  id: 'srm',
  name: 'SRM',
  workspacePath: 'C:\\Users\\dev\\.kai-toolbox\\sources\\srm-system',
  ready: false,
  status: 'PARTIAL',
  message: '1/2 个仓库已拉取',
  members: [
    { name: 'srm', path: 'srm-system/srm', cloned: true, status: 'READY', message: '已是最新' },
    { name: 'srm-admin-front-end', path: 'srm-system/srm-admin-front-end', cloned: false, status: 'NOT_CLONED', message: '未拉取' },
  ],
}]

afterEach(cleanup)

describe('BusinessSourceOperations', () => {
  it('展示托管根目录并触发一键拉取', () => {
    const onSync = vi.fn()
    render(<BusinessSourceOperations systems={systems} checking={false} busy={false} syncing={false}
      error={false} onRefresh={vi.fn()} onSync={onSync} />)

    expect(screen.getByText('4 个系统、6 个固定仓库。', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('C:\\Users\\dev\\.kai-toolbox\\sources')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '一键拉取' }))
    expect(onSync).toHaveBeenCalledOnce()
  })

  it('读取失败时提供重新检查入口', () => {
    render(<BusinessSourceOperations systems={undefined} checking={false} busy={false} syncing={false}
      error onRefresh={vi.fn()} onSync={vi.fn()} />)

    expect(screen.getByText('暂时无法读取源码状态。', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '检查状态' })).toBeEnabled()
  })
})
