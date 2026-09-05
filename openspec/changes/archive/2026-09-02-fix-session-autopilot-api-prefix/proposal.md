## Why

The session autopilot status reader currently sends `/api/api/claude-chat/...` because it passes an already-prefixed path to the shared authenticated fetch wrapper. This prevents the newly delivered supervision status panel from reading its server state even though the backend route exists.

## What Changes

- Remove the duplicate API prefix from the session autopilot status request.
- Add a frontend contract test that asserts the final URL passed to `fetch`.
- Keep the existing backend route, response semantics, authentication, and all other autopilot actions unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `session-autopilot`: make the canonical per-session status read path explicit and cover it with a client request contract scenario.

## Impact

- Affected code: `frontend/src/features/claude-chat/api.ts` and its focused API test.
- API contract: no change; the client again targets `GET /api/claude-chat/sessions/{sessionId}/autopilot`.
- Dependencies, persistence, and server behavior: unchanged.
- Evidence sources: the accepted `session-autopilot` spec, the shared `authFetch` contract, the Spring controller mapping, and the reproduced runtime responses for correct and duplicated paths.
- Non-goals: changing global 404 handling, refactoring the shared API client, or altering autopilot state behavior.
- Unresolved decisions: none.
