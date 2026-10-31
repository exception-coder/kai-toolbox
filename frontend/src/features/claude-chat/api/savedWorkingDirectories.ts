import { getDevPreference, saveDevPreference } from '@/features/_devkit/public-api'
import { registerWorkspaceRoot } from '@/features/project-workspace/public-api'
import { addSavedWorkingDirectory, savedWorkingDirectories, workingDirectoryKey } from '../lib/savedWorkingDirectories'
import { browseWorkingDirectory } from './workingDirectories'

const PREFERENCE_ID = 'vibe-working-directories'

export async function listSavedWorkingDirectories(): Promise<string[]> {
  return savedWorkingDirectories(await getDevPreference<unknown>(PREFERENCE_ID))
}

export async function saveWorkingDirectory(path: string): Promise<string[]> {
  if (!path.trim()) throw new Error('请先选择或输入工作目录。')
  // Validate the actual path and global exclusion policy before saving a shortcut.
  const directory = await browseWorkingDirectory(path)
  const current = await listSavedWorkingDirectories()
  const next = addSavedWorkingDirectory(current, directory.path)
  // 即使快捷入口已经存在，也补齐旧版本没有登记的正式工作区。
  await registerWorkspaceRoot(directory.path)
  if (next !== current) {
    try { await saveDevPreference(PREFERENCE_ID, { directories: next }) }
    catch (error) { throw new Error(`工作区已登记，但常用目录快捷入口保存失败，请重试：${error instanceof Error ? error.message : '保存失败'}`) }
  }
  return next
}

export async function removeSavedWorkingDirectory(path: string): Promise<string[]> {
  // An unavailable/excluded directory must still be removable; this never deletes filesystem data.
  const current = await listSavedWorkingDirectories()
  const next = current.filter(value => workingDirectoryKey(value) !== workingDirectoryKey(path))
  if (next.length !== current.length) await saveDevPreference(PREFERENCE_ID, { directories: next })
  return next
}
