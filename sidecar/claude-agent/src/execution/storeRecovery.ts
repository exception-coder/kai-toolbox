import fs from 'node:fs'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { requireCondition } from '../specResolution/contracts.js'
import { hash, readText, safePath, saveJson, statePath, storeMutex } from '../specResolution/storage.js'
import { projectContext } from './repository.js'

export const inspectStoreSchema = z.object({ project: z.string().min(1) })
export const recoverStoreSchema = inspectStoreSchema.extend({
  fingerprint: z.string().length(64), actor: z.string().min(1).max(200), reason: z.string().min(15).max(2000),
  legacyProcessesStopped: z.literal(true),
})
export function inspectStoreLock(raw: unknown) {
  const { root } = projectContext(inspectStoreSchema.parse(raw).project, false)
  const file = safePath(root, '.forge/spec-resolution/write.lock')
  if (!fs.existsSync(file)) return { project: root, lock: null }
  const content = readText(file)
  const stat = fs.statSync(file)
  return { project: root, lock: { fingerprint: hash(JSON.stringify([content, stat.ino, stat.birthtimeMs, stat.mtimeMs])),
    kind: content === 'forge-sqlite-mutex-v1' ? 'MANAGED' : 'LEGACY',
    recovery: '旧锁恢复前须确认所有旧版写入进程已停止；未知状态不能仅凭超时回收。' } }
}
export function recoverStoreLock(raw: unknown) {
  const input = recoverStoreSchema.parse(raw)
  const { root } = projectContext(input.project, false)
  return storeMutex(root, () => {
    const snapshot = inspectStoreLock({ project: root })
    requireCondition(snapshot.lock?.fingerprint === input.fingerprint, 'EXECUTION_CONTEXT_MISMATCH', '锁现场变化；重新 inspect_store_lock')
    const id = `store-recovery-${randomUUID()}`
    saveJson(statePath(root, id), { ...snapshot, actor: input.actor, reason: input.reason,
      recoveredAt: new Date().toISOString(), legacyProcessesStopped: true })
    fs.renameSync(safePath(root, '.forge/spec-resolution/write.lock'), safePath(root, `.forge/spec-resolution/${id}.lock`))
    return { allowed: true, code: 'PASS', auditId: id }
  })
}
