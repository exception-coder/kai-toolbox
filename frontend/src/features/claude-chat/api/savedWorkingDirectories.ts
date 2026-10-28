import { getDevPreference, saveDevPreference } from '@/features/_devkit/public-api'
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
  if (next !== current) await saveDevPreference(PREFERENCE_ID, { directories: next })
  return next
}

export async function removeSavedWorkingDirectory(path: string): Promise<string[]> {
  // An unavailable/excluded directory must still be removable; this never deletes filesystem data.
  const current = await listSavedWorkingDirectories()
  const next = current.filter(value => workingDirectoryKey(value) !== workingDirectoryKey(path))
  if (next.length !== current.length) await saveDevPreference(PREFERENCE_ID, { directories: next })
  return next
}
