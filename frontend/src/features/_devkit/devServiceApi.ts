import { http } from '@/lib/api'

/**
 * 「开发服务」通用客户端（按项目 id）。各「XX 需求开发」工作台模块共用,后端为 DevServiceController
 * （/api/claude-chat/dev-service/{id}/...）。是脚手架生成模块的公共前端能力。
 */

export interface DevServiceStatus {
  id: string
  running: boolean
  pid: number | null
  workDir: string | null
  command: string | null
  startedAt: number | null
  uptimeMs: number | null
}

type DevServiceResult = DevServiceStatus | { ok: false; error: string }

/** SSE 日志流地址（EventSource 直连,经 Vite /api 代理）。 */
export const devServiceLogStream = (id: string) =>
  `/api/claude-chat/dev-service/${encodeURIComponent(id)}/logs/stream`

export function getDevServiceStatus(id: string) {
  return http<DevServiceStatus>(`/claude-chat/dev-service/${encodeURIComponent(id)}/status`)
}

export function startDevService(id: string, cwd: string, command: string) {
  return http<DevServiceResult>(`/claude-chat/dev-service/${encodeURIComponent(id)}/start`, {
    method: 'POST', body: JSON.stringify({ cwd, command }),
  })
}

export function stopDevService(id: string, stopCommand?: string) {
  return http<DevServiceResult>(`/claude-chat/dev-service/${encodeURIComponent(id)}/stop`, {
    method: 'POST', body: JSON.stringify({ stopCommand: stopCommand || undefined }),
  })
}

export function restartDevService(id: string, cwd: string, command: string, stopCommand?: string) {
  return http<DevServiceResult>(`/claude-chat/dev-service/${encodeURIComponent(id)}/restart`, {
    method: 'POST', body: JSON.stringify({ cwd, command, stopCommand: stopCommand || undefined }),
  })
}

/**
 * 端口就绪探测：后端对 localhost 的一组端口做 TCP connect，返回 { "8889": true, ... }。
 * 供服务就绪徽标条判断多服务里各子服务是否已监听（浏览器直连后端端口会被 CORS 挡，故走后端探）。
 */
export function checkDevPorts(ports: number[]) {
  return http<Record<string, boolean>>(
    `/claude-chat/dev-service/ports?ports=${ports.join(',')}`)
}
