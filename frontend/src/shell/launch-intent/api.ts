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
  navigate(`${route}?launchIntent=${encodeURIComponent(intent.id)}`)
}

function withoutType(payload: LaunchIntentPayload): Record<string, unknown> {
  const { type: _type, ...body } = payload
  return body
}
