import type { Engine, WorkspaceList } from '../types'
import type { ProviderProfile } from '../providerProfiles'
import { isKnownEngine, supportsSessionProvider } from './engineCatalog'

export interface NewSessionPreferences {
  workspaceRoot: string
  cwd: string
  engine: Engine
  providerId: string
}

export const emptyNewSessionPreferences = (): NewSessionPreferences => ({
  workspaceRoot: '', cwd: '', engine: 'claude', providerId: '',
})
export const newSessionPreferenceKey = (userId?: number) =>
  'kai-toolbox:claude-chat:new-session:v1:' + (userId ?? 'local')

/** 只读白名单字段；不恢复凭据、会话标题、模型、执行策略或未知版本。 */
export function loadNewSessionPreferences(userId?: number): { value: NewSessionPreferences; recent?: NewSessionPreferences; warning?: string } {
  try {
    const raw = localStorage.getItem(newSessionPreferenceKey(userId))
    if (!raw) return { value: emptyNewSessionPreferences() }
    if (raw.length > 16_384) throw new Error('too large')
    const data = JSON.parse(raw)
    if (!data || data.version !== 1 || !isKnownEngine(data.engine)
      || typeof data.workspaceRoot !== 'string' || data.workspaceRoot.length > 2048
      || typeof data.cwd !== 'string' || data.cwd.length > 2048
      || typeof data.providerId !== 'string' || data.providerId.length > 256) throw new Error('invalid')
    const value = { workspaceRoot: data.workspaceRoot.trim(), cwd: data.cwd.trim(),
      engine: data.engine, providerId: supportsSessionProvider(data.engine) ? data.providerId : '' }
    const recent = data.recent
    const validRecent = recent && isKnownEngine(recent.engine) && typeof recent.workspaceRoot === 'string'
      && recent.workspaceRoot.length <= 2048 && typeof recent.cwd === 'string' && recent.cwd.length <= 2048
      && typeof recent.providerId === 'string' && recent.providerId.length <= 256
    return { value, recent: validRecent ? { workspaceRoot: recent.workspaceRoot.trim(), cwd: recent.cwd.trim(),
      engine: recent.engine, providerId: supportsSessionProvider(recent.engine) ? recent.providerId : '' } : undefined }
  } catch {
    return { value: emptyNewSessionPreferences(), warning: '无法读取本地新建偏好，已使用默认选择；仍可手动新建。' }
  }
}

/** 仅保存目录、引擎和档案 ID；存储失败不阻断选择或会话。 */
export function saveNewSessionPreferences(userId: number | undefined, value: NewSessionPreferences, recent?: NewSessionPreferences): string | undefined {
  try {
    if (!isKnownEngine(value.engine) || value.workspaceRoot.length > 2048 || value.cwd.length > 2048
      || value.providerId.length > 256) return '当前目录或服务商标识过长，无法保存偏好；本次选择仍可使用。'
    localStorage.setItem(newSessionPreferenceKey(userId), JSON.stringify({
      version: 1, workspaceRoot: value.workspaceRoot.trim(), cwd: value.cwd.trim(), engine: value.engine,
      providerId: supportsSessionProvider(value.engine) ? value.providerId : '',
      ...(recent ? { recent: { workspaceRoot: recent.workspaceRoot, cwd: recent.cwd, engine: recent.engine,
        providerId: supportsSessionProvider(recent.engine) ? recent.providerId : '' } } : {}),
    }))
    return undefined
  } catch {
    return '浏览器未允许保存新建偏好；本次选择仍可使用，刷新后可能无法恢复。'
  }
}

function directoryIdentity(path: string): string {
  const normalized = path.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

/** 以完整路径恢复工作区，不因根目录排序变化或删除而选中另一个目录。 */
export function resolveNewSessionWorkspace(roots: WorkspaceList['roots'], savedRoot: string) {
  const available = roots.filter(root => root.exists)
  return savedRoot ? available.find(root => directoryIdentity(root.root) === directoryIdentity(savedRoot)) ?? null
    : available[0] ?? null
}

/** 不将未读取、已失效或不支持的服务商静默换成官方，也不猜测引擎可用性。 */
export function newSessionSelectionIssue(value: NewSessionPreferences, evidence: {
  engines: Engine[]; enginesLoading: boolean; providers: ProviderProfile[];
  providersLoading: boolean; providersFailed: boolean
}): string | undefined {
  if (!evidence.engines.includes(value.engine)) return evidence.enginesLoading
    ? '正在核对上次选择的引擎，请稍候或选择当前可用引擎。' : '所选引擎当前不可用，请重新选择或检测引擎。'
  if (supportsSessionProvider(value.engine) && value.providerId && !evidence.providers.some(profile => profile.id === value.providerId)) {
    return evidence.providersLoading ? '正在读取上次选择的服务商档案…' : evidence.providersFailed
      ? '服务商档案读取失败，请重试或重新选择；没有自动切换到官方默认。'
      : '上次选择的服务商已不可用，请重新选择；没有自动切换到官方默认。'
  }
}
