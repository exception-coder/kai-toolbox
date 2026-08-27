import { http } from '@/lib/api'
import {
  LAUNCH_INTENT_PROTOCOL_VERSION,
  parseLaunchIntent,
  type LaunchIntentPayload,
  type LaunchIntentView,
} from './types'

export async function createLaunchIntent(payload: LaunchIntentPayload): Promise<LaunchIntentView> {
  const response = await http<unknown>('/launch-intents', {
    method: 'POST',
    body: JSON.stringify({
      protocolVersion: LAUNCH_INTENT_PROTOCOL_VERSION,
      type: payload.type,
      payload: withoutType(payload),
    }),
  })
  return parseLaunchIntent(response)
}

export async function loadLaunchIntent(id: string): Promise<LaunchIntentView> {
  return parseLaunchIntent(await http<unknown>(`/launch-intents/${encodeURIComponent(id)}`))
}

export async function acknowledgeLaunchIntent(id: string): Promise<void> {
  await http(`/launch-intents/${encodeURIComponent(id)}/ack`, { method: 'POST' })
}

export async function failLaunchIntent(id: string, error: string): Promise<void> {
  await http(`/launch-intents/${encodeURIComponent(id)}/fail`, {
    method: 'POST',
    body: JSON.stringify({ error: error || '启动意图执行失败' }),
  })
}

export async function navigateWithLaunchIntent(
  navigate: (path: string) => void,
  route: string,
  payload: LaunchIntentPayload,
): Promise<void> {
  const intent = await createLaunchIntent(payload)
  navigate(buildLaunchIntentRoute(route, intent.id, payload))
}

/**
 * 构造启动意图的首次目标路由。
 *
 * 规格开发作用域必须随首次导航进入 ChatRuntime；如果等新会话 ready 后再补，
 * 运行时会从普通通道切换到 PRD 开发通道并丢失刚创建的当前会话投影。
 */
export function buildLaunchIntentRoute(
  route: string,
  intentId: string,
  payload: LaunchIntentPayload,
): string {
  const search = new URLSearchParams()
  search.set('launchIntent', intentId)
  if (payload.type === 'CHAT_OPEN_AND_SEND' && payload.prdSessionId) {
    search.set('prdSessionId', payload.prdSessionId)
  }
  return `${route}?${search.toString()}`
}

function withoutType(payload: LaunchIntentPayload): Record<string, unknown> {
  const { type: _type, ...body } = payload
  return body
}
