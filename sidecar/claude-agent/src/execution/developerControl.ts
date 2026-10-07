import fs from 'node:fs'
import { readJson, safePath } from '../specResolution/storage.js'
import { requireCondition } from '../specResolution/contracts.js'

/** Shared with the developer panel; never stored behind an execution writer or exposed as an Agent mutation tool. */
export function developerControl(project: string) {
  const root = fs.realpathSync(project)
  const file = safePath(root, '.forge/execution-control.json')
  if (!fs.existsSync(file)) return { project: root, enabled: true, revision: 0, verificationCadence: 'CHECKPOINT' }
  const value = readJson<{ schemaVersion: number; project: string; enabled: boolean; revision: number; verificationCadence?: string }>(file)
  requireCondition(value?.schemaVersion === 1 && value.project === root && typeof value.enabled === 'boolean'
    && Number.isSafeInteger(value.revision) && value.revision >= 0,
  'EXECUTION_CONTROL_INVALID', '项目编码门禁配置无效；从监督面板核对控制状态')
  requireCondition(value.verificationCadence === undefined
    || ['CHECKPOINT', 'PER_TASK', 'CODING_FIRST'].includes(value.verificationCadence),
  'EXECUTION_CONTROL_INVALID', '项目验证方式无效；从监督面板核对控制状态')
  return { project: root, enabled: value.enabled, revision: value.revision,
    verificationCadence: value.verificationCadence ?? 'CHECKPOINT' }
}

export function developerBypass(project: string) {
  const control = developerControl(project)
  return control.enabled ? undefined : { allowed: true, code: 'GOVERNANCE_DISABLED', skipped: true,
    verified: false, completed: false, protocolVersion: 2, policyVersion: 2,
    governanceBackend: 'none', enforcement: 'warn', legacyGovernanceRequired: false, control,
    message: '开发者已关闭本项目编码门禁；无需申请 writer 或补齐治理绑定，可继续授权开发。未执行或认可验证，也未完成或释放原执行。',
    actions: ['保留其他会话文件，按开发者要求编码并如实运行适用测试；不要重试被关闭的门禁。服务重启及资源访问仍需原授权。'] }
}
