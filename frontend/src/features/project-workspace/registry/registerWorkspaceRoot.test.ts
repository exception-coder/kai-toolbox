import { beforeEach, expect, it, vi } from 'vitest'
import { getConfigBlock, updateConfigBlock, PROJECT_DIRECTORY_BLOCKS, type ConfigBlockView } from '@/features/config-center/public-api'
import { registerWorkspaceRoot } from './registerWorkspaceRoot'

vi.mock('@/features/config-center/public-api', async original => ({
  ...await original<typeof import('@/features/config-center/public-api')>(), getConfigBlock: vi.fn(), updateConfigBlock: vi.fn(),
}))
beforeEach(() => vi.resetAllMocks())
const id = PROJECT_DIRECTORY_BLOCKS.workspace
const block = (unified: boolean): ConfigBlockView => ({ id, name: '工作区', entries: [
  { key: `${id}.roots`, type: 'list', values: ['D:/work'], value: null, overridden: false },
  { key: `${id}.directories-unified`, value: String(unified), overridden: false },
] })

it('preserves legacy roots on first registration and does not duplicate an already unified root', async () => {
  vi.mocked(getConfigBlock).mockResolvedValueOnce(block(false)).mockResolvedValueOnce({
    id: PROJECT_DIRECTORY_BLOCKS.projects, name: '旧目录', entries: [{ key: `${PROJECT_DIRECTORY_BLOCKS.projects}.root`, value: 'E:/legacy', overridden: false }],
  })
  await registerWorkspaceRoot('D:/projects')
  expect(updateConfigBlock).toHaveBeenCalledWith(id, {
    [`${id}.roots[0]`]: 'D:/work', [`${id}.roots[1]`]: 'E:/legacy', [`${id}.roots[2]`]: 'D:/projects', [`${id}.directories-unified`]: 'true',
  }, [`${id}.roots`])
  vi.mocked(updateConfigBlock).mockClear()
  vi.mocked(getConfigBlock).mockResolvedValue(block(true))
  await registerWorkspaceRoot('d:\\WORK\\')
  expect(updateConfigBlock).not.toHaveBeenCalled()
})

it('does not replace configured roots after an invalid path or failed configuration read', async () => {
  await expect(registerWorkspaceRoot('relative')).rejects.toThrow('绝对目录')
  expect(getConfigBlock).not.toHaveBeenCalled()
  vi.mocked(getConfigBlock).mockRejectedValueOnce(new Error('配置读取失败'))
  await expect(registerWorkspaceRoot('D:/projects')).rejects.toThrow('配置读取失败')
  expect(updateConfigBlock).not.toHaveBeenCalled()
})
