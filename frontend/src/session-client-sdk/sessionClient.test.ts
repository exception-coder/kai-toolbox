import { describe, expect, it, vi } from 'vitest'
import { createSessionClient } from './sessionClient'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = 1
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null
  sent: string[] = []

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  send(payload: string) { this.sent.push(payload) }
  close(code = 1000) { this.onclose?.({ code }) }
  emit(payload: unknown) { this.onmessage?.({ data: JSON.stringify(payload) }) }
}

const session = {
  sessionId: 's1', status: 'IDLE', profile: 'DELEGATED_DEVELOPMENT', grantStatus: 'ACTIVE',
  expiresAt: '2030-01-01T00:00:00Z', maxTurns: 10, usedTurns: 0, maxInputBytes: 4096,
  sessionVersion: 4,
}

function setup(existingStorage = new Map<string, string>(), respond?: (url: string) => { status: number; body: unknown }) {
  FakeWebSocket.instances = []
  const fetcher = vi.fn(async (url: string) => {
    const result = respond?.(url) ?? { status: 200, body: url.endsWith('/connections') ? { ticket: 'single-use-ticket' } : session }
    return new Response(JSON.stringify(result.body), { status: result.status, headers: { 'Content-Type': 'application/json' } })
  })
  const storage = existingStorage
  const client = createSessionClient({
    requestBaseUrl: 'https://forge.local',
    getAccessToken: () => 'grant-access-token',
    fetch: fetcher as unknown as typeof fetch,
    WebSocket: FakeWebSocket as unknown as typeof WebSocket,
    storage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => { storage.set(key, value) },
      removeItem: key => { storage.delete(key) },
    },
  })
  return { client, fetcher, storage }
}

describe('session client SDK', () => {
  it('supports a same-origin Relay path without sending a Forge authorization header', async () => {
    FakeWebSocket.instances = []
    const fetcher = vi.fn(async (url: string) => new Response(JSON.stringify(
      url.endsWith('/connections') ? { ticket: 'relay-ticket' } : session,
    ), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const client = createSessionClient({
      requestBaseUrl: 'https://business.local', apiPath: '/api/forge-session-relay/v1',
      fetch: fetcher as unknown as typeof fetch, WebSocket: FakeWebSocket as unknown as typeof WebSocket,
      storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
    })

    await client.connect()

    expect(fetcher.mock.calls[0]?.[0]).toBe('https://business.local/api/forge-session-relay/v1/session')
    expect((fetcher.mock.calls[0]?.[1] as RequestInit).headers).not.toHaveProperty('Authorization')
    expect(FakeWebSocket.instances[0].url).toContain('/api/forge-session-relay/v1/ws')
    client.destroy()
  })

  it('keeps the grant token out of the WebSocket URL and attaches with a watermark', async () => {
    const { client, fetcher } = setup()
    await client.connect()
    const ws = FakeWebSocket.instances[0]

    expect(ws.url).toContain('ticket=single-use-ticket')
    expect(ws.url).not.toContain('grant-access-token')
    expect(JSON.parse(ws.sent[0])).toMatchObject({ type: 'attach', protocolVersion: '1.0', lastEventSeq: 0 })
    const firstCall = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(firstCall[1]?.headers).toMatchObject({ Authorization: 'Bearer grant-access-token' })
  })

  it('suppresses duplicate and out-of-order events while advancing the persisted watermark', async () => {
    const { client, storage } = setup()
    const seen: number[] = []
    client.subscribe(event => seen.push(event.seq))
    await client.connect()
    const ws = FakeWebSocket.instances[0]
    const event = (seq: number) => ({ protocolVersion: '1.0', type: 'progress', seq,
      sessionVersion: 4, occurredAt: new Date().toISOString(), data: {} })

    ws.emit(event(3)); ws.emit(event(3)); ws.emit(event(2)); ws.emit(event(4))

    expect(seen).toEqual([3, 4])
    expect([...storage.values()]).toContain('4')
  })

  it('uses stable expected version and unique command ids for participant sends', async () => {
    const { client } = setup()
    await client.connect()
    const commandId = await client.send({ text: 'continue' })
    const sent = JSON.parse(FakeWebSocket.instances[0].sent.at(-1)!)

    expect(sent).toMatchObject({ type: 'send', commandId, expectedSessionVersion: 4, text: 'continue' })
  })

  it('replays an unacknowledged command with the same id after reload', async () => {
    const storage = new Map<string, string>()
    const first = setup(storage)
    await first.client.connect()
    const commandId = await first.client.send({ text: 'finish the task' })
    first.client.destroy()

    const second = setup(storage)
    await second.client.connect()
    const resent = FakeWebSocket.instances.at(-1)!.sent.map(item => JSON.parse(item))

    expect(resent).toContainEqual(expect.objectContaining({ type: 'send', commandId, text: 'finish the task' }))
  })

  it('moves to terminal state when the access token has expired', async () => {
    const { client } = setup(new Map(), () => ({ status: 401, body: {
      code: 'AUTHENTICATION_REQUIRED', message: 'token expired', retryable: false,
    } }))
    const states: string[] = []
    client.subscribeState(state => states.push(state))

    await expect(client.connect()).rejects.toMatchObject({ code: 'AUTHENTICATION_REQUIRED' })
    expect(states).toContain('terminal')
  })

  it('closes permanently when the owner revokes the grant', async () => {
    const { client } = setup()
    const states: string[] = []
    client.subscribeState(state => states.push(state))
    await client.connect()
    FakeWebSocket.instances[0].emit({
      protocolVersion: '1.0', type: 'error', seq: 5, sessionVersion: 5,
      occurredAt: new Date().toISOString(),
      error: { code: 'GRANT_REVOKED', message: 'revoked', retryable: false },
    })

    expect(states.at(-1)).toBe('terminal')
  })

  it('surfaces replay gaps and host-offline state without accepting incompatible events', async () => {
    const { client } = setup()
    const events: string[] = []
    const states: string[] = []
    client.subscribe(event => events.push(event.type))
    client.subscribeState(state => states.push(state))
    await client.connect()
    const ws = FakeWebSocket.instances[0]

    ws.emit({ protocolVersion: '2.0', type: 'message', seq: 5, sessionVersion: 5,
      occurredAt: new Date().toISOString(), data: { text: 'must be ignored' } })
    ws.emit({ protocolVersion: '1.0', type: 'replayGap', seq: 6, sessionVersion: 5,
      occurredAt: new Date().toISOString(), data: { earliestAvailableSeq: 4 } })
    ws.close(1006)

    expect(events).toEqual(['replayGap'])
    expect(states.at(-1)).toBe('offline')
    client.destroy()
  })
})
