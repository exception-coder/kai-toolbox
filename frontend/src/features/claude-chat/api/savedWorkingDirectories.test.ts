import { beforeEach, expect, it, vi } from 'vitest'
import { getDevPreference, saveDevPreference } from '@/features/_devkit/public-api'
import { browseWorkingDirectory } from './workingDirectories'
import { listSavedWorkingDirectories, removeSavedWorkingDirectory, saveWorkingDirectory } from './savedWorkingDirectories'
import { workingDirectoryKey } from '../lib/savedWorkingDirectories'

vi.mock('@/features/_devkit/public-api', () => ({ getDevPreference: vi.fn(), saveDevPreference: vi.fn() }))
vi.mock('./workingDirectories', () => ({ browseWorkingDirectory: vi.fn() }))
beforeEach(() => vi.resetAllMocks())

it('reads persisted paths and preserves the latest server list when adding a canonical directory', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['E:/existing'] })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'D:\\work\\中文', parent: 'D:\\work', directories: [], truncated: false })
  expect(await saveWorkingDirectory('D:/work/中文')).toEqual(['E:/existing', 'D:\\work\\中文'])
  expect(saveDevPreference).toHaveBeenCalledWith('vibe-working-directories', { directories: ['E:/existing', 'D:\\work\\中文'] })
  expect(getDevPreference).toHaveBeenCalledWith('vibe-working-directories')
})

it('does not duplicate Windows slash, case or trailing slash variants', async () => {
  vi.mocked(getDevPreference).mockResolvedValue({ directories: ['D:/Work/'] })
  vi.mocked(browseWorkingDirectory).mockResolvedValue({ path: 'd:\\work', parent: 'd:\\', directories: [], truncated: false })
  expect(await saveWorkingDirectory('d:\\work')).toEqual(['D:/Work/'])
  expect(saveDevPreference).not.toHaveBeenCalled()
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
