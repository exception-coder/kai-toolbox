import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ForgeEnvironmentSnapshot } from '../types'
import { ReadinessSummary } from './ReadinessSummary'

afterEach(cleanup)

const blockedSnapshot: ForgeEnvironmentSnapshot = {
  state: 'BLOCKED',
  ready: false,
  readyCount: 8,
  totalCount: 12,
  blockingCount: 2,
  checkedAt: '2026-08-26T08:00:00Z',
  groups: [],
}

describe('ReadinessSummary', () => {
  it('展示阻断摘要并启动一键初始化', () => {
    const onInitialize = vi.fn()
    render(
      <ReadinessSummary
        snapshot={blockedSnapshot}
        refreshing={false}
        initializing={false}
        onRefresh={() => undefined}
        onInitialize={onInitialize}
      />,
    )

    expect(screen.getByText('2 项阻断')).toBeInTheDocument()
    expect(screen.getByText('依赖已就绪').previousElementSibling).toHaveTextContent('8 / 12')
    fireEvent.click(screen.getByRole('button', { name: '一键初始化' }))
    expect(onInitialize).toHaveBeenCalledOnce()
  })

  it('初始化期间锁定两个操作入口', () => {
    render(
      <ReadinessSummary
        snapshot={blockedSnapshot}
        refreshing={false}
        initializing
        onRefresh={() => undefined}
        onInitialize={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '重新检测' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '正在初始化' })).toBeDisabled()
  })
})
