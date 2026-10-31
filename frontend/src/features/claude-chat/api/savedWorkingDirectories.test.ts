import { beforeEach, expect, it, vi } from 'vitest'
import { getDevPreference, saveDevPreference } from '@/features/_devkit/public-api'
import { browseWorkingDirectory } from './workingDirectories'
import { listSavedWorkingDirectories, removeSavedWorkingDirectory, saveWorkingDirectory } from './savedWorkingDirectories'
import { workingDirectoryKey } from '../lib/savedWorkingDirectories'
import { registerWorkspaceRoot } from '@/features/project-workspace/public-api'

vi.mock('@/features/_devkit/public-api', () => ({ getDevPreference: vi.fn(), saveDevPreference: vi.fn() }))
vi.mock('./workingDirectories', () => ({ browseWorkingDirectory: vi.fn() }))
vi.mock('@/features/project-workspace/public-api', () => ({ registerWorkspaceRoot: vi.fn() }))
beforeEach(() => { vi.resetAllMocks(); vi.mocked(registerWorkspaceRoot).mockResolvedValue(undefined) })

it('reads persisted paths and preserves the latest server list when adding a canonical directory', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['E:/existing'] })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:\\work\\中文', parent: 'D:\\work', directories: [], truncated: false })
  expect(await saveWorkingDirectory('D:/work/中文')).toEqual(['E:/existing', 'D:\\work\\中文'])
  expect(saveDevPreference).toHaveBeenCalledWith('vibe-working-directories', { directories: ['E:/existing', 'D:\\work\\中文'] })
  expect(getDevPreference).toHaveBeenCalledWith('vibe-working-directories')
  expect(registerWorkspaceRoot).toHaveBeenCalledWith('D:\\work\\中文')
})

it('does not duplicate Windows slash, case or trailing slash variants', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['D:/Work/'] })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'd:\\work', parent: 'd:\\', directories: [], truncated: false })
  expect(await saveWorkingDirectory('d:\\work')).toEqual(['D:/Work/'])
  expect(saveDevPreference).not.toHaveBeenCalled()
  expect(registerWorkspaceRoot).toHaveBeenCalledWith('d:\\work')
  expect(workingDirectoryKey('/Work')).not.toBe(workingDirectoryKey('/work'))
  expect(workingDirectoryKey('/')).toBe('/')
})

it('never overwrites storage when validation, reading or payload decoding fails', async () => {
  await expect(saveWorkingDirectory('')).rejects.toThrow('请先选择')
  vi.mocked(browseWorkingDirectory).mockRejectedValueOnce(new Error('目录已排除'))
  await expect(saveWorkingDirectory('D:/hidden')).rejects.toThrow('目录已排除')
  expect(getDevPreference).not.toHaveBeenCalled()
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:/work', parent: 'D:/', directories: [], truncated: false })
  vi.mocked(getDevPreference).mockRejectedValueOnce(new Error('读取失败'))
  await expect(saveWorkingDirectory('D:/work')).rejects.toThrow('读取失败')
  vi.mocked(getDevPreference).mockResolvedValue({ directories: 'broken' })
  await expect(saveWorkingDirectory('D:/work')).rejects.toThrow('格式异常')
  expect(saveDevPreference).not.toHaveBeenCalled()
  expect(registerWorkspaceRoot).not.toHaveBeenCalled()
})

it('preserves preferences on registration failure and reports a partially saved workspace accurately', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['E:/keep'] })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:/projects', parent: 'D:/', directories: [], truncated: false })
  vi.mocked(registerWorkspaceRoot).mockRejectedValueOnce(new Error('没有目录配置权限'))
  await expect(saveWorkingDirectory('D:/projects')).rejects.toThrow('没有目录配置权限')
  expect(saveDevPreference).not.toHaveBeenCalled()
  vi.mocked(saveDevPreference).mockRejectedValueOnce(new Error('偏好保存失败'))
  await expect(saveWorkingDirectory('D:/projects')).rejects.toThrow('工作区已登记，但常用目录快捷入口保存失败')
})

it('removes unavailable shortcuts without browsing or deleting filesystem content', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['D:/gone', 'E:/keep'] })
  expect(await removeSavedWorkingDirectory('d:\\GONE')).toEqual(['E:/keep'])
  expect(browseWorkingDirectory).not.toHaveBeenCalled()
  expect(saveDevPreference).toHaveBeenCalledWith('vibe-working-directories', { directories: ['E:/keep'] })
})

it('handles a missing preference and enforces an explicit capacity limit', async () => {
  vi.mocked(getDevPreference).mockResolvedValue(undefined)
  expect(await listSavedWorkingDirectories()).toEqual([])
  vi.mocked(getDevPreference).mockResolvedValue({ directories: Array.from({ length: 50 }, (_, i) => `D:/dir-${i}`) })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:/new', parent: 'D:/', directories: [], truncated: false })
  await expect(saveWorkingDirectory('D:/new')).rejects.toThrow('最多保存 50')
  expect(saveDevPreference).not.toHaveBeenCalled()
})
