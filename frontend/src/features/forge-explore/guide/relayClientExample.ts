import { createSessionClient } from '@/session-client-sdk'
import type { SessionClientEvent } from '@/session-client-sdk'

// 用户已登录业务系统后调用；fetcher 可注入业务系统的 CSRF 处理。
export async function pairRelayClient(
  invitationCode: string,
  onEvent: (event: SessionClientEvent) => void,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
) {
  const apiPath = '/api/forge-session-relay/v1'
  const paired = await fetcher(`${apiPath}/pair`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationCode }),
  })
  if (!paired.ok) throw new Error(`配对失败（HTTP ${paired.status}），请核对业务登录态与邀请。`)

  // 示例缓存仅属于本次实例；刷新后从 loadHistory() 恢复公开历史。
  const pending = new Map<string, string>()
  const client = createSessionClient({
    requestBaseUrl: window.location.origin,
    apiPath,
    fetch: fetcher,
    storage: {
      getItem: key => pending.get(key) ?? null,
      setItem: (key, value) => { pending.set(key, value) },
      removeItem: key => { pending.delete(key) },
    },
    // 使用业务同源 Cookie，不向浏览器提供 Forge 授权令牌。
  })
  const unsubscribe = client.subscribe(onEvent)
  const dispose = () => { unsubscribe(); client.destroy(); pending.clear() }
  try {
    const session = await client.connect()
    const history = await client.loadHistory()
    return { client, session, history, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

// 用户提交：await connection.client.send({ text: draft })，失败保留草稿。
// 页面卸载：connection.dispose()。replayGap 由宿主补读并合并历史。
