import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDevDocVersionContent,
  listDevDocVersions,
  listProgressVersions,
} from '../../api'
import {
  ClarifyHistorySheet,
  DevDocClarifyHistorySheet,
} from './ClarificationHistorySheets'
import {
  DevDocHistorySheet,
  DevDocVersionViewDialog,
  ProgressHistorySheet,
} from './ArtifactHistoryDialogs'

vi.mock('../../api', () => ({
  getDevDocVersionContent: vi.fn(),
  getProgressVersionContent: vi.fn(),
  listDevDocVersions: vi.fn(),
  listProgressVersions: vi.fn(),
}))

afterEach(cleanup)

beforeEach(() => {
  vi.mocked(listDevDocVersions).mockResolvedValue([])
  vi.mocked(listProgressVersions).mockResolvedValue([])
  vi.mocked(getDevDocVersionContent).mockResolvedValue('')
})

describe('规格历史与版本弹层', () => {
  it('展示需求澄清记录、未填写答案并支持关闭', () => {
    const onClose = vi.fn()
    render(
      <ClarifyHistorySheet
        questions={[{ id: 1, question: '目标用户是谁？', answer: '' }]}
        onClose={onClose}
      />,
    )

    expect(screen.getByRole('dialog', { name: '需求澄清问答记录' })).toBeInTheDocument()
    expect(screen.getByText('目标用户是谁？')).toBeInTheDocument()
    expect(screen.getByText('（未填写）')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('开发文档澄清记录优先展示当前版本', async () => {
    vi.mocked(listDevDocVersions).mockResolvedValue([
      { version: 1, isCurrent: false, mode: 'generate', extraInstructions: null, generatedAt: 1, qaHistory: [] },
      {
        version: 2,
        isCurrent: true,
        mode: 'update',
        extraInstructions: null,
        generatedAt: 2,
        qaHistory: [{ question: '兼容旧数据吗？', answer: '需要兼容' }],
      },
    ])

    render(<DevDocClarifyHistorySheet sessionId="session-1" onClose={vi.fn()} />)

    expect(await screen.findByText('兼容旧数据吗？')).toBeInTheDocument()
    expect(screen.getByText('（v2 · 共 1 题）')).toBeInTheDocument()
  })

  it('开发文档版本记录保留模式、问答和查看回调', async () => {
    const onViewVersion = vi.fn()
    vi.mocked(listDevDocVersions).mockResolvedValue([
      {
        version: 3,
        isCurrent: true,
        mode: 'update',
        extraInstructions: null,
        generatedAt: 3,
        qaHistory: [{ question: '如何验收？', answer: '执行回归测试' }],
      },
    ])

    render(
      <DevDocHistorySheet sessionId="session-1" onViewVersion={onViewVersion} onClose={vi.fn()} />,
    )

    fireEvent.click(await screen.findByRole('button', { name: '查看此版本文档内容 →' }))
    expect(screen.getByText('更新版本')).toBeInTheDocument()
    expect(screen.getByText('执行回归测试')).toBeInTheDocument()
    expect(onViewVersion).toHaveBeenCalledWith(3, true)
  })

  it('进度记录显式展示加载失败', async () => {
    vi.mocked(listProgressVersions).mockRejectedValue(new Error('服务不可用'))
    render(<ProgressHistorySheet sessionId="session-1" onViewVersion={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByText('加载失败：服务不可用')).toBeInTheDocument()
  })

  it('版本预览复用安全 Markdown 渲染并展示当前标识', async () => {
    vi.mocked(getDevDocVersionContent).mockResolvedValue('# 开发方案<script>alert(1)</script>')
    const { container } = render(
      <DevDocVersionViewDialog
        sessionId="session-1"
        version={2}
        isLatest
        onClose={vi.fn()}
      />,
    )

    expect(await screen.findByRole('heading', { name: '开发方案' })).toBeInTheDocument()
    expect(screen.getByText('当前版本')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('script')).toBeNull())
  })
})
