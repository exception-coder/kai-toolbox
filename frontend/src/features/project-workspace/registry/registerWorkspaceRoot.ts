import { getConfigBlock, updateConfigBlock, PROJECT_DIRECTORY_BLOCKS } from '@/features/config-center/public-api'
import { projectPathKey } from '../lib/projectScope'
import { DIRECTORY_SECTIONS, directoriesUnified, directoryDraft, directoryUpdate, directoryValues, unifiedDirectoryBlock } from './directorySettingsModel'

/** 通过项目库的同一份目录配置追加工作区，不改变已有根或托管源码设置。 */
export async function registerWorkspaceRoot(path: string): Promise<void> {
  const root = path.trim()
  if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(root) || /[\r\n\0]/.test(root)) throw new Error('请先选择有效的绝对目录。')
  const workspace = await getConfigBlock(PROJECT_DIRECTORY_BLOCKS.workspace)
  const unified = directoriesUnified(workspace)
  const effective = unified ? workspace : unifiedDirectoryBlock(workspace, await getConfigBlock(PROJECT_DIRECTORY_BLOCKS.projects))
  const roots = directoryValues(effective, `${workspace.id}.roots`)
  const existing = roots.some(value => projectPathKey(value) === projectPathKey(root))
  if (existing && unified) return
  const section = DIRECTORY_SECTIONS.find(value => value.id === workspace.id)!
  const initial = directoryDraft(effective, section)
  const draft = { ...initial, roots: (existing ? roots : [...roots, root]).join('\n') }
  const { overrides, replacePrefixes } = directoryUpdate(section, initial, draft, !unified)
  if (!unified) overrides[`${workspace.id}.directories-unified`] = 'true'
  await updateConfigBlock(workspace.id, overrides, replacePrefixes)
}
