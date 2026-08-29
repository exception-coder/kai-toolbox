import { http } from '@/lib/api'
import type { BusinessSystemWorkspace, ForgeEnvironmentSnapshot } from './types'

const SOURCE = 'gitee'

/** 读取 Forge 环境快照；远端刷新仅在用户显式检测时开启。 */
export function getForgeEnvironment(fetchRemote = false) {
  const query = new URLSearchParams({ source: SOURCE, fetch: String(fetchRemote) })
  return http<ForgeEnvironmentSnapshot>(`/claude-chat/forge-environment?${query.toString()}`)
}

/** 返回固定 Gitee 源的一键初始化 SSE 路径。 */
export function forgeEnvironmentBootstrapPath() {
  return `/claude-chat/forge-environment/bootstrap/stream?source=${SOURCE}`
}

/** 返回固定工作区、默认 Gitee 源的一键套件安装 SSE 路径。 */
export function teamSuiteInstallPath() {
  return `/claude-chat/plugins/install/stream?source=${SOURCE}`
}

/** 返回固定工作区、默认 Gitee 源的一键套件更新 SSE 路径。 */
export function teamSuiteUpdatePath() {
  return `/claude-chat/plugins/update/stream?source=${SOURCE}`
}

/** 读取固定业务系统源码目录与 Git 状态。 */
export function getBusinessSystemWorkspaces(fetchRemote = false) {
  return http<BusinessSystemWorkspace[]>(
    `/claude-chat/plugins/business-systems?fetch=${String(fetchRemote)}`,
  )
}

/** 返回四个业务系统、六个固定仓库的一键拉取 SSE 路径。 */
export function businessSourceSyncPath() {
  return '/claude-chat/plugins/business-systems/sync/stream?system=all'
}
