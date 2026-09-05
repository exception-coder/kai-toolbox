## Context

`authFetch()` prepends `/api` to every feature-level path and documents that callers must omit that prefix. `getSessionAutopilot()` violates this local contract, while the other autopilot API functions correctly pass `/claude-chat/...`. Runtime probing against port 18080 confirms that the canonical route reaches `SessionAutopilotController` and the duplicated route falls through to static-resource handling.

Current implementation coordinates:

- `frontend/src/lib/api.ts:5,48-53` defines and applies the shared API base.
- `frontend/src/features/claude-chat/api.ts:264-268` contains the incorrect caller.
- `tools/tool-claude-chat/src/main/java/com/exceptioncoder/toolbox/claudechat/api/SessionAutopilotController.java:22,42-46` defines the canonical server route.
- `frontend/src/features/claude-chat/components/SessionAutopilotStatus.test.tsx:15-21` mocks the API boundary and therefore cannot detect malformed final URLs.

## Goals / Non-Goals

**Goals:**

- Restore the canonical session autopilot status request.
- Add a regression test at the request boundary so duplicated base prefixes fail automatically.

**Non-Goals:**

- Change backend routes, authorization, status response semantics, or autopilot state behavior.
- Refactor the shared API client or globally remap `NoResourceFoundException`.

## Decisions

- Remove `/api` only from the `getSessionAutopilot()` caller. This follows the documented `authFetch()` contract and keeps the blast radius to one leaf call site. Changing `authFetch()` would affect every authenticated binary and multipart request.
- Test the exported API function with a mocked global `fetch`, while mocking token refresh. This exercises URL composition without requiring a browser or backend process and complements the existing component tests that intentionally mock the API module.
- Preserve the raw `Response` handling because HTTP 204 represents a valid absence of an autopilot run.

## Risks / Trade-offs

- [Risk] A broad fetch mock could hide headers or status handling. → Mitigation: assert the exact URL and retain focused assertions for the 204 and JSON response branches.
- [Risk] Existing uncommitted work overlaps `api.ts`. → Mitigation: patch only the single path literal and add a separate focused test file.

## Migration Plan

No data or API migration is required. Deploy the rebuilt frontend with the existing backend. Rollback is the reversal of the one caller-path edit and its test.

## Open Questions

None.
