# @kai/session-client

Framework-independent TypeScript client for one Forge-delegated Vibe Coding session. The server binds every token
to one participant, one session, and one immutable capability profile.

## Build and install

Build the standalone ESM package and declarations from `frontend/`:

```powershell
npm run session-client:build
```

For local integration, install `dist-session-client/` as a file dependency. Production consumers should use the
same directory after it is published to the internal npm registry.

## Obtain a session grant token

The Forge owner first creates a delegation and gives the participant its one-time invitation code. Exchange that
code while the participant is authenticated to Forge. Invitation exchange is intentionally outside this SDK so
the host application remains responsible for Forge login.

```ts
const response = await fetch(
  'https://forge.company.internal/api/session-client/v1/invitations/exchange',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${forgeLoginToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ invitationCode }),
  },
)
if (!response.ok) throw new Error('Session invitation exchange failed')
const { accessToken } = await response.json() as { accessToken: string }
```

## Connect and send

```ts
import { createSessionClient } from '@kai/session-client'

const client = createSessionClient({
  requestBaseUrl: 'https://forge.company.internal',
  getAccessToken: () => accessToken,
})

const session = await client.connect()
const unsubscribe = client.subscribe(event => console.log(event))
const unsubscribeState = client.subscribeState(state => console.log(state))
await client.send({ text: '报价单增加 Excel 导出' })

// On application teardown:
unsubscribe()
unsubscribeState()
client.destroy()
```

Use `upload(file)` before sending attachments, `answerQuestion(requestId, answers)` for business questions,
`interrupt()` to stop the participant's own turn, and `loadHistory(before, limit)` after an explicit history
recovery request.

## Server requirements

- Enable the entry with `FORGE_SESSION_CLIENT_ENABLED=true`.
- Same-origin clients work without CORS configuration.
- Cross-origin clients require an exact HTTPS origin in `FORGE_SESSION_CLIENT_ALLOWED_ORIGINS` and an HTTPS/WSS
  ingress that routes both REST and WebSocket traffic to the same Forge server.
- The participant cannot switch workspace, model, engine, provider, permission mode, auto-approval, or approve
  risky tools. OpenSpec supervision is exposed only as projected progress events.

Protocol `1.0` uses a grant token only in the `Authorization` header. WebSocket URLs contain a 30-second,
single-use ticket. The SDK never stores the grant token. Terminal authorization errors stop reconnecting;
ordinary host outages use bounded backoff.

## Connect through a business Spring Boot server

An HTTPS page does not need direct access to a LAN Forge host. Install
`forge-session-relay-spring-boot-starter`, pair the authenticated business principal on the server, and point the
same SDK at the business application's same-origin Relay path:

```ts
const client = createSessionClient({
  requestBaseUrl: window.location.origin,
  apiPath: '/api/forge-session-relay/v1',
})
```

Without `getAccessToken`, requests use the business application's cookie. The business server keeps Forge
credentials and maps its authenticated principal to a Forge user; the browser never submits `subjectUserId`, a
target session, or a Forge LAN address. See `sdk/forge-session-relay-spring-boot-starter/README.md` for server
configuration and the required participant-resolver and binding-store contracts.
