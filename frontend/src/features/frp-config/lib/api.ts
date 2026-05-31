import { http } from '@/lib/api'
import type { FrpcConfig, FrpMode, FrpsConfig } from './types'

/**
 * /api/frp/targets/:hostId/:mode 的视图。
 * 每个 (hostId, mode) 是独立的一条记录——同一台主机的 frps 和 frpc 配置完全分开。
 */
export interface FrpTargetView {
  hostId: string
  mode: 'FRPS' | 'FRPC'
  installDir: string
  /** 当 mode=FRPS 时是 FrpsConfig 的 JSON 串；mode=FRPC 时是 FrpcConfig 的 JSON 串。 */
  configJson: string | null
  updatedAt: number
}

export interface FrpTargetUpsertPayload {
  installDir: string
  configJson: string
}

function modeToApi(mode: FrpMode): 'FRPS' | 'FRPC' {
  return mode === 'frps' ? 'FRPS' : 'FRPC'
}

export function listFrpTargets() {
  return http<FrpTargetView[]>('/frp/targets')
}

/** 取某主机所有角色的快照（frps + frpc 各一行，或缺其一）。 */
export function listTargetsForHost(hostId: string) {
  return http<FrpTargetView[]>(`/frp/targets/${encodeURIComponent(hostId)}`)
}

/** 找不到返回 null（404 包装），调用方据此走默认值。 */
export async function getFrpTarget(hostId: string, mode: FrpMode): Promise<FrpTargetView | null> {
  try {
    return await http<FrpTargetView>(
      `/frp/targets/${encodeURIComponent(hostId)}/${modeToApi(mode)}`,
    )
  } catch (e) {
    if (isNotFound(e)) return null
    throw e
  }
}

export function upsertFrpTarget(
  hostId: string,
  mode: FrpMode,
  payload: FrpTargetUpsertPayload,
) {
  return http<FrpTargetView>(
    `/frp/targets/${encodeURIComponent(hostId)}/${modeToApi(mode)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
}

/** 安全解析 configJson 回前端类型；坏 JSON 返回 null。 */
export function parseFrpsConfig(json: string | null): FrpsConfig | null {
  if (!json) return null
  try { return JSON.parse(json) as FrpsConfig } catch { return null }
}

export function parseFrpcConfig(json: string | null): FrpcConfig | null {
  if (!json) return null
  try { return JSON.parse(json) as FrpcConfig } catch { return null }
}

function isNotFound(e: unknown): boolean {
  return typeof e === 'object' && e !== null && 'status' in e && (e as { status: number }).status === 404
}
