import { createSessionClient } from '@/session-client-sdk'
import type { ConnectionState, PublicMessage, SessionClientEvent } from '@/session-client-sdk'

interface ParticipantHost {
  requestBaseUrl: string
  grantId: string
  accessToken: string
  onEvent: (event: SessionClientEvent) => void
  onState: (state: ConnectionState) => void
  onHistory: (messages: PublicMessage[]) => void
  onError: (error: unknown) => void
}

// 在宿主完成登录与邀请码兑换后调用。页面示例不会自动执行此函数。
export async function connectParticipant(host: ParticipantHost) {
  // 同一 Origin 的不同授权隔离水位和待确认命令，避免切换授权时串用缓存。
  const prefix = `forge-grant:${host.grantId}:`
  const client = createSessionClient({
    requestBaseUrl: host.requestBaseUrl,
    getAccessToken: () => host.accessToken,
    storage: {
      getItem: key => sessionStorage.getItem(prefix + key),
      setItem: (key, value) => sessionStorage.setItem(prefix + key, value),
      removeItem: key => sessionStorage.removeItem(prefix + key),
    },
  })
  let disposed = false
  const stopState = client.subscribeState(host.onState)
  const stopEvents = client.subscribe(event => {
    host.onEvent(event)
    if (event.type === 'replayGap') {
      void client.loadHistory().then(page => {
        if (!disposed) host.onHistory(page.items)
      }).catch(error => { if (!disposed) host.onError(error) })
    }
  })
  const dispose = () => {
    disposed = true
    stopEvents()
    stopState()
    client.destroy()
  }
  try {
    const summary = await client.connect()
    const history = await client.loadHistory()
    host.onHistory(history.items)
    return { client, summary, dispose }
  } catch (error) {
    dispose()
    throw error
  }
}

// 宿主按消息 ID 合并历史、处理增量文字，并在提交按钮事件中调用 client.send()。
// 页面卸载调用 dispose()；捕获发送错误并保留草稿，不自动重发业务请求。
