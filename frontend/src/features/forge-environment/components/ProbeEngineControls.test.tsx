import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProbeEngineControls } from './ProbeEngineControls'
import { getForgeEnvironment } from '../api'
import type { ForgeEnvironmentSnapshot } from '../types'

vi.mock('../api', () => ({ getForgeEnvironment: vi.fn() }))
const snapshot: ForgeEnvironmentSnapshot = {
  state: 'READY', ready: true, readyCount: 0, totalCount: 0, blockingCount: 0,
  checkedAt: '2026-09-13T00:00:00Z', groups: [],
  measurement: { engine: 'java', totalMs: 1400, probesMs: 900, commands: [{ id: 'git', exitCode: 0, completed: true, output: 'git', durationMs: 90 }] },
}

describe('ProbeEngineControls', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(cleanup)

  it('switches engines without requiring an existing snapshot', () => {
    const onChange = vi.fn()
    render(<ProbeEngineControls engine="java" onChange={onChange} busy={false} comparing={false} onComparing={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(onChange).toHaveBeenCalledWith('go')
  })

  it('compares fresh local requests sequentially and preserves successful results on Go failure', async () => {
    let resolveFirst!: (snapshot: ForgeEnvironmentSnapshot) => void
    vi.mocked(getForgeEnvironment).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockRejectedValueOnce(new Error('Go 检测器未构建'))
    const onComparing = vi.fn()
    render(<ProbeEngineControls engine="java" onChange={vi.fn()} busy={false} comparing={false} onComparing={onComparing} />)
    fireEvent.click(screen.getByRole('button', { name: '对比两种实现' }))
    expect(getForgeEnvironment).toHaveBeenCalledTimes(1)
    expect(getForgeEnvironment).toHaveBeenNthCalledWith(1, false, 'java', true)
    resolveFirst(snapshot)
    await screen.findByText('Go 检测器未构建')
    expect(getForgeEnvironment).toHaveBeenNthCalledWith(2, false, 'go', true)
    expect(screen.getByText('0.90 s')).toBeInTheDocument()
    await waitFor(() => expect(onComparing).toHaveBeenLastCalledWith(false))
  })

  it('prevents competing actions during installation', () => {
    render(<ProbeEngineControls engine="java" onChange={vi.fn()} busy comparing={false} onComparing={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '对比两种实现' })).toBeDisabled()
  })
})
