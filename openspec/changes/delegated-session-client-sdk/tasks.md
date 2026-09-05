## Quick Navigation

- **服务端基础** → [1. Contract and domain foundation](#1-contract-and-domain-foundation) / [2. Persistence and token boundary](#2-persistence-and-token-boundary)
- **协议与安全** → [3. Delegation control plane](#3-delegation-control-plane) / [4. Public realtime protocol](#4-public-realtime-protocol) / [5. Sidecar execution policy](#5-sidecar-execution-policy)
- **Client 交付** → [6. TypeScript Session Client SDK](#6-typescript-session-client-sdk) / [7. Reference Client and owner UI](#7-reference-client-and-owner-ui)
- **验收发布** → [8. Integration and release evidence](#8-integration-and-release-evidence)

## 1. Contract and domain foundation

- [x] 1.1 Add public protocol and domain enums for grant status, participant commands, public event types, execution profile, error codes, and protocol version.
- [x] 1.2 Implement the Session Access Grant aggregate with create, consume invitation, pause, resume, revoke, expire, quota, subject/session binding, and optimistic-version rules.
- [x] 1.3 Add unit tests for grant lifecycle, invalid transitions, invitation replay, expiry, binding mismatch, quotas, and optimistic conflicts.

## 2. Persistence and token boundary

- [x] 2.1 Add idempotent SQLite tables and indexes for grants, hashed one-time invitations, connection tickets, command receipts, and bounded audit events.
- [x] 2.2 Implement repositories with atomic invitation/ticket consumption, grant version checks, command idempotency, and audit pagination.
- [x] 2.3 Implement grant-scoped access-token claims and 30-second single-use WebSocket tickets without logging raw credentials.
- [x] 2.4 Add repository and token tests for concurrent consumption, immediate revocation, audience/session/subject mismatch, and cleanup of expired records.

## 3. Delegation control plane

- [x] 3.1 Implement owner/admin authorization and application services for creating, listing, inspecting, pausing, resuming, revoking, and reissuing invitations.
- [x] 3.2 Add management REST endpoints under `/api/claude-chat/sessions/{sessionId}/delegations` with conflict-safe request/response contracts.
- [x] 3.3 Add participant invitation exchange, public session summary, paged projected history, attachment upload, and connection-ticket endpoints under `/api/session-client/v1`.
- [x] 3.4 Add controller tests for roles, session ownership, enumeration resistance, limits, precise CORS, and stable public error codes.

## 4. Public realtime protocol

- [x] 4.1 Implement a dedicated Session Client WebSocket handshake that validates one-time ticket, exact Origin, active grant, participant, session, and protocol compatibility.
- [x] 4.2 Implement an allow-list public command dispatcher for attach, send, answer business question, interrupt own turn, and acknowledge, without deserializing administrator commands.
- [x] 4.3 Implement command receipts, expected session version checks, single-active-turn arbitration, and integration with the existing server-side message queue.
- [x] 4.4 Implement a public event projector and replay buffer that expose safe messages, attachments, execution/autopilot progress, business questions, and terminal states only.
- [x] 4.5 Add WebSocket tests for ticket replay, unknown-command rejection, duplicate commands, version conflicts, reconnect replay, replay gaps, revocation disconnect, and sensitive-event redaction.

## 5. Sidecar execution policy

- [x] 5.1 Add the `delegated-development` execution/tool policy and propagate its immutable profile from the server when opening or resuming the canonical session.
- [x] 5.2 Separate business-question responses from risky tool approvals so only the Forge owner can approve the latter.
- [x] 5.3 Add Sidecar tests proving prompts and malformed protocol input cannot change workspace, model, engine, provider, permission mode, auto-approval, or invoke profile-excluded tools.

## 6. TypeScript Session Client SDK

- [x] 6.1 Create the framework-independent `@kai/session-client` package, build configuration, declarations, protocol types, and public exports.
- [x] 6.2 Implement access-token use, connection-ticket exchange, WebSocket lifecycle, bounded backoff, watermark replay, paged history recovery, and terminal auth handling.
- [x] 6.3 Implement idempotent send/attachment/question/interrupt methods with persisted command IDs and non-sensitive connection state.
- [x] 6.4 Add SDK tests for ACK loss, reload recovery, duplicate/out-of-order events, replay gaps, host offline, token expiry, grant revocation, and incompatible versions.
- [x] 6.5 Add package README, initialization examples, security constraints, supported protocol matrix, and release artifacts.

## 7. Reference Client and owner UI

- [x] 7.1 Add an independently reachable responsive Session Client route for login/invitation pairing, bound-session summary, constraints, messages, attachments, business questions, progress, and completion.
- [x] 7.2 Implement recoverable loading, offline, paused, expired, revoked, replay-gap, rate-limit, and server-error states following the project visual standard.
- [x] 7.3 Add a Vibe Coding delegation panel with participant/profile/expiry/connection/audit display and create, pause, resume, revoke, copy-invitation, and takeover actions.
- [x] 7.4 Add frontend component and accessibility tests, then verify representative desktop and mobile states in a real browser.

## 8. Integration and release evidence

- [ ] 8.1 Verify a same-machine end-to-end flow from owner delegation through participant send, Agent response, reconnect, business question, automatic-supervision progress, completion, and revocation.
- [ ] 8.2 Verify the flow through an HTTPS/WSS enterprise ingress with exact Origin configuration and confirm long-lived tokens never appear in URLs or access logs.
- [x] 8.3 Run Sidecar tests, backend module tests, frontend SDK/component tests, typecheck, production build, and Forge Quality Gate; record only executed checks and fix in-scope failures.
- [ ] 8.4 Register all affected HTTP APIs, update architecture/index documentation, run strict OpenSpec validation, and prepare the change for archive after every requirement has evidence.

  > Server 分层与 Client 快速接入文档、接口登记和 strict validation 已完成；待 8.1/8.2 真实环境证据齐全后归档。
