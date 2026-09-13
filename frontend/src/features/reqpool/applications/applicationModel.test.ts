import { expect, it } from 'vitest'
import { applicationPath, applicationWorkspaces } from './applicationModel'
import type { RegistryProject } from '@/features/project-workspace/public-api'
import type { OpenSpecProjectSummary } from '@/features/openspec-board/public-api'

const app = (id: string, localPath: string) => ({ id, metadata: { localPath, name: id } } as RegistryProject)
const workspace = (id: string, sourcePath?: string) => ({ id, sourcePath } as OpenSpecProjectSummary)

it('matches Windows paths while retaining POSIX case sensitivity', () => {
  expect(applicationPath('D:\\Code\\App\\')).toBe(applicationPath('d:/code/app'))
  expect(applicationPath('/Code/App')).not.toBe(applicationPath('/code/app'))
  expect(applicationWorkspaces([app('a', 'D:/Code/App')], [workspace('w', 'd:/code/app/')])[0]?.workspace?.id).toBe('w')
})
it('does not guess missing paths or similarly named applications', () => {
  expect(applicationWorkspaces([app('same', '/app')], [workspace('same')])[0]?.workspace).toBeUndefined()
})
it('rejects ambiguous system and workspace identities', () => {
  expect(applicationWorkspaces([app('a', '/app'), app('b', '/app')], [workspace('w', '/app')]).every(entry => entry.ambiguous && !entry.workspace)).toBe(true)
  expect(applicationWorkspaces([app('a', '/app')], [workspace('w', '/app'), workspace('x', '/app')])[0]?.ambiguous).toBe(true)
})
