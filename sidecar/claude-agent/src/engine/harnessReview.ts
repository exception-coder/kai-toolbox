import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HarnessClientOptions } from '@deepseek-ai/dsh-sdk-client'

/** sdk-minimal has no inherited user plugins; remove every tool producer in the pinned profile. */
export function harnessReviewOptions(cwd: string): Pick<HarnessClientOptions, 'profile' | 'patches' | 'dshHome'> {
  const home = join(cwd, '.harness-review')
  mkdirSync(home, { recursive: true, mode: 0o700 })
  const patch = join(home, 'no-tools.json')
  writeFileSync(patch, JSON.stringify(['tool-fs', 'tool-working-directory', 'persistent-bash', 'persistent-pwsh', 'mcp-resources']
    .map(id => ({ id, disabled: true }))), { mode: 0o600 })
  return { profile: 'sdk-minimal', dshHome: home, patches: [patch] }
}
