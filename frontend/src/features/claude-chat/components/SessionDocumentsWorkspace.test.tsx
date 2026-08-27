import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PrdSessionView } from '@/features/prd-clarify/public-api'
import { SessionDocumentsWorkspace } from './SessionDocumentsWorkspace'

const getContent = vi.fn(async (_id: string) => '# 核心规格\n业务规则')
const getInitialSpecContent = vi.fn(async (_id: string) => '# 初始化规格')
const getDevDocContent = vi.fn(async (_id: string) => '# 执行计划\n技术方案')

vi.mock('@/features/prd-clarify/public-api', async importOriginal => ({
  ...(await importOriginal<typeof import('@/features/prd-clarify/public-api')>()),
  getContent: (id: string) => getContent(id),
  getInitialSpecContent: (id: string) => getInitialSpecContent(id),
  getDevDocContent: (id: string) => getDevDocContent(id),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const session = {
  id: 'prd-1',
  title: '报价刷新规格',
  project: 'SRM',
  module: '询价议价',
  mdPath: 'D:/docs/prd.md',
  initialSpecPath: 'D:/docs/initial.md',
  devDocPath: 'D:/docs/tdd.md',
} as PrdSessionView

describe('SessionDocumentsWorkspace', () => {
  it('在一个页签内切换核心规格、初始化规格与 TDD 正文', async () => {
    render(<SessionDocumentsWorkspace session={session} onManage={vi.fn()} onOpenSource={vi.fn()} />)

    expect(await screen.findByText('业务规则')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'TDD / 执行计划' }))
    expect(await screen.findByText('技术方案')).toBeInTheDocument()
    expect(getContent).toHaveBeenCalledWith('prd-1')
    expect(getDevDocContent).toHaveBeenCalledWith('prd-1')
  })

  it('把管理与来源操作留在工作区工具栏', async () => {
    const manage = vi.fn()
    const openSource = vi.fn()
    render(<SessionDocumentsWorkspace session={session} onManage={manage} onOpenSource={openSource} />)
    await waitFor(() => expect(getContent).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: '管理关联与同步' }))
    fireEvent.click(screen.getByRole('button', { name: '规格探索' }))
    expect(manage).toHaveBeenCalledTimes(1)
    expect(openSource).toHaveBeenCalledTimes(1)
  })
})
