import type { Engine, PermissionMode } from '../types'

export interface PermissionModeOption {
  value: PermissionMode
  label: string
  desc: string
}

const CLAUDE_MODES: PermissionModeOption[] = [
  { value: 'default', label: '默认', desc: '每次工具调用前都征求你同意' },
  { value: 'acceptEdits', label: '自动接受', desc: '自动放行文件编辑，其余仍逐个询问' },
  { value: 'plan', label: '计划', desc: '只探索代码并给出计划，不直接改动' },
  { value: 'bypassPermissions', label: '全自动', desc: '所有工具调用都不再询问，直接执行' },
]

const CODEX_MODES: PermissionModeOption[] = [
  { value: 'default', label: '请求批准', desc: '编辑外部文件和使用互联网时始终询问' },
  { value: 'acceptEdits', label: '帮我批准', desc: '仅对检测到的风险操作请求批准' },
  { value: 'bypassPermissions', label: '完全访问权限', desc: '可不受限制地访问互联网和电脑上的任何文件' },
]

const OPENCODE_MODES: PermissionModeOption[] = [
  { value: 'default', label: '引擎自管', desc: '权限审批由 OpenCode 自身配置管理' },
]

export function permissionModesForEngine(engine: Engine): PermissionModeOption[] {
  if (engine === 'codex') return CODEX_MODES
  if (engine === 'opencode') return OPENCODE_MODES
  return CLAUDE_MODES
}

export function normalizePermissionModeForEngine(engine: Engine, mode: PermissionMode): PermissionMode {
  return permissionModesForEngine(engine).some(option => option.value === mode) ? mode : 'default'
}
