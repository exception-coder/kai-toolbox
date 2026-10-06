import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { PluginPanel } from './PluginPanel'

const stream = vi.hoisted(() => vi.fn(() => ({ close: vi.fn(), onmessage: null, onerror: null })))
vi.mock('@/lib/api', () => ({ authEventSource: stream }))
vi.mock('../api', () => ({
  listSuites: vi.fn(async () => []),
  listTeamRepositories: vi.fn(async () => [{ name: 'team-standards', cloned: false }]),
  listBusinessSystemWorkspaces: vi.fn(async () => []),
  getTeamDependencyEnvironment: vi.fn(async () => null),
  getSidecarVersion: vi.fn(async () => null),
  pluginInstallStreamPath: vi.fn(() => '/install'),
  pluginUpdateStreamPath: vi.fn(() => '/update'),
  businessWorkspaceSyncStreamPath: vi.fn(() => '/business'),
  fetchTeamRepositoryGitFileDiff: vi.fn(),
  fetchTeamRepositoryGitStatus: vi.fn(),
}))

afterEach(() => { cleanup(); vi.clearAllMocks(); localStorage.clear() })

it('查看面板不自动写入，初始化按钮只启动仓库同步且防止重复操作', async () => {
  render(<PluginPanel onClose={vi.fn()} />)
  const initialize = await screen.findByRole('button', { name: '初始化缺失仓库（1）' })
  const install = screen.getByRole('button', { name: /并安装/ })
  expect(stream).not.toHaveBeenCalled()
  fireEvent.click(initialize)
  expect(stream).toHaveBeenCalledExactlyOnceWith('/claude-chat/plugins/repositories/sync/stream?source=gitee')
  expect(initialize).toBeDisabled()
  expect(install).toBeDisabled()
})
