import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BootstrapProgress } from './BootstrapProgress'

afterEach(cleanup)

describe('BootstrapProgress', () => {
  it('保留失败上下文并提供恢复入口', () => {
    const onRetry = vi.fn()
    render(
      <BootstrapProgress
        steps={[{
          id: 'graphify',
          name: 'Graphify',
          state: 'FAILED',
          message: '安装失败',
          detail: 'uv tool install graphifyy returned 1',
        }]}
        logs={['正在安装 Graphify', '命令退出码 1']}
        running={false}
        error="Graphify 安装失败，请检查网络后重试。"
        restartRequired={null}
        onRetry={onRetry}
      />,
    )

    expect(screen.getByText('初始化未完成')).toBeInTheDocument()
    expect(screen.getByText('Graphify 安装失败，请检查网络后重试。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重新检测' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('安装影响当前进程时明确提示重启后继续', () => {
    render(
      <BootstrapProgress
        steps={[]}
        logs={[]}
        running={false}
        error={null}
        restartRequired={{ message: 'PATH 已更新，请重启 Forge。', completed: ['node'] }}
        onRetry={() => undefined}
      />,
    )

    expect(screen.getByText('需要重启 Forge 后继续')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重启后重新检测' })).toBeEnabled()
  })
})
