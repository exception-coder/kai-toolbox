import { useEffect, useRef, useState } from 'react'
import type { SessionClient } from '../../types'
import type { CollaborationAdapter } from '../contracts'
import { applyRelayEvent, initialRelayView } from '../model/forgeRelayState'

/** 管理当前抽屉的会话生命周期，异步完成不能复活已关闭的连接。 */
export function useForgeRelay(identity: string, adapter: CollaborationAdapter) {
  const [view, setView] = useState(initialRelayView)
  const [busy, setBusy] = useState(false)
  const [historyIds, setHistoryIds] = useState<Set<string>>(new Set())
  const client = useRef<SessionClient | undefined>(undefined)
  const generation = useRef(0)
  const submitting = useRef(false)

  async function connect(invitation?: string) {
    const current = ++generation.current
    client.current?.destroy()
    setBusy(true)
    setView({ ...initialRelayView, connection: 'connecting' })
    try {
      const session = invitation ? await adapter.pair(invitation) : await adapter.readSession()
      if (current !== generation.current) return
      const active = adapter.createClient(identity, session, Boolean(invitation))
      client.current = active
      active.subscribe(event => {
        if (current !== generation.current) return
        setView(previous => applyRelayEvent(previous, event))
        if (event.error && ['AUTH_REQUIRED', 'RELAY_AUTHENTICATION_REQUIRED', 'GRANT_PAUSED', 'GRANT_REVOKED', 'GRANT_EXPIRED'].includes(event.error.code)) {
          active.destroy()
          setView(previous => ({ ...previous, connection: 'terminal' }))
        }
      })
      active.subscribeState(connection => {
        if (current === generation.current) setView(previous => ({ ...previous, connection }))
      })
      setView(previous => ({ ...previous, session }))
      const history = await active.loadHistory()
      if (current !== generation.current) return
      setHistoryIds(new Set(history.items.map(message => message.id)))
      setView(previous => ({ ...previous, messages: history.items,
        error: history.transcriptMissing ? '历史消息暂不可用，仍可连接会话。' : '' }))
      await active.connect()
    } catch (error) {
      if (current !== generation.current) return
      client.current?.destroy()
      setView(previous => ({ ...previous, connection: 'offline', error: relayError(error) }))
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }

  useEffect(() => {
    void connect()
    return () => { generation.current++; client.current?.destroy() }
  }, [identity, adapter])

  async function run(action: (active: SessionClient) => Promise<unknown>) {
    if (!client.current || busy || submitting.current) return false
    submitting.current = true
    setBusy(true)
    setView(previous => ({ ...previous, error: '' }))
    try { await action(client.current); return true }
    catch (error) { setView(previous => ({ ...previous, error: relayError(error) })); return false }
    finally { submitting.current = false; setBusy(false) }
  }

  return { view, busy, historyIds, connect, run,
    dismissQuestion: () => setView(previous => ({ ...previous, question: undefined })) }
}

function relayError(error: unknown): string {
  return error instanceof Error ? error.message : '协同开发暂不可用，请重试或联系会话所有者。'
}
