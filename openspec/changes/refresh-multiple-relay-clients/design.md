## Context

DynamicConfigService already owns SQLite overrides and EnvironmentChangeEvent. RefreshableConfigRegistry registers annotated configuration beans. SessionRelayClientAuthenticator currently compares one ID/Secret from SessionClientProperties. Graphify's August 25 graph located dynamicconfig; targeted current source reads supersede stale Relay graph coverage.

## Goals / Non-Goals

Reuse existing configuration CRUD and refresh infrastructure. Support independent Relay clients and an editor within config-center. Do not create another module, database schema or publish/draft subsystem, and do not modify Yoooni One.

## Decisions

- Extract Relay properties under the same existing prefix into a refreshable bean. A clients list owns ID, name, enabled and secret. Explicit managed mode prevents legacy fallback after removing the last client. Preserve deployment credential keys for compatibility.
- Authentication consumes a freshly bound Relay snapshot on configuration events rather than retaining mutable nested bean state. Fresh binding restores defaults on removal; one volatile reference publishes a complete validated snapshot.
- Add a small reusable validation contract to dynamicconfig for block-specific checks, keeping Relay rules in its own configuration type. Validate a candidate environment before publishing values, persist changes transactionally and restore the old environment on failures.
- Existing /api/config/blocks CRUD remains the integration contract. The config-center Relay editor serializes client rows as indexed keys and uses replacePrefixes for whole-list replacement, including the existing empty-list sentinel. Other pages can call the same endpoint. No general page generator is required.
- Secret values follow the existing administrator configuration boundary; Relay editor uses password controls. Do not log supplied secrets or include binding exception values in responses. Existing schema stores configuration strings; encrypted secret storage is not introduced by this change.
- Preserve existing relay:<client-id> audit identity. Disabling a client stops subsequent Relay authentication; grant-scoped credentials already issued retain their existing revocation contract. No implicit session termination is added.

## Risks / Trade-offs

- Property removal can retain old bean values in Spring Cloud 4.2: bind a fresh snapshot for Relay and test reset, list shrink and empty list.
- Shared dynamicconfig changes affect other blocks: keep existing API compatible and test legacy scalar/list CRUD and persistence rollback with SQLite.
- Legacy credentials might reactivate: managed mode is explicit and survives restart, with an empty managed list denying every client. Reset explicitly returns to deployment defaults.
- Configuration updates are single-instance and serialized. No cross-process synchronization is claimed.

## Migration Plan

Deploy once, then open Relay in the existing configuration center. Existing single credentials keep working until switching to managed clients; include the existing system in the managed list before saving. Subsequent edits need no restart. Rollback code preserves SQLite rows, but the old binary understands only legacy deployment credentials; restore those deliberately before rollback.

## Verification

Test independent credentials, duplicate/invalid clients, disabled clients, rotation, deletion, empty list, legacy fallback boundaries, restart restoration and rejected persistence. Exercise the actual DynamicConfigService event path, not only setters. Run frontend type checks and editor tests, then the required Forge quality gate and report only executed checks. Browser review follows existing quiet-luxury-ui composition.

## Reuse Contract

Register configuration beans with `@ConfigurationProperties` and `@Refreshable`. Optionally implement `DynamicConfigValidatable` for validation after candidate binding; validation must be side-effect-free and errors must not include secrets. Ordinary property beans use the existing Spring Cloud rebinding. Stateful consumers can listen to `EnvironmentChangeEvent`, filter their own prefix and construct a fresh validated snapshot before replacing their runtime reference, as SessionRelayClientAuthenticator does.

Custom pages use `GET /api/config/blocks`, `GET /api/config/blocks/{id}`, `PUT /api/config/blocks/{id}` with `overrides` and `replacePrefixes`, and `DELETE /api/config/blocks/{id}/overrides` for explicit reset. The block ID is its configuration prefix. Indexed lists are replaced as a whole; send the list prefix with an empty string and include it in replacePrefixes to persist an empty list. No extra refresh request is necessary after a successful save. The existing administrator boundary is configured in toolbox-starter/src/main/resources/config/common/toolbox-auth.yml for `/api/config/**`.

Relay's block ID is `toolbox.claude-chat.session-client.relay`. Its editor sets `managed=true` and maintains `clients[index].client-id`, `.name`, `.enabled` and `.client-secret` through this contract. Secret inputs are masked visually but the existing administrator API returns configuration values and SQLite retains strings; this change does not claim write-only secrets or encrypted storage.

## Execution Evidence

- Java 21 Maven reactor compilation and targeted tests: 7 passed, zero failures/skips. SessionRelayConfigurationRefreshTest uses real SQLite and the actual configuration service/event/authenticator path; the other tests cover malformed credentials and controller audit identity forwarding.
- RelayClientsEditor Vitest: 2 passed, including failed-save draft retention and explicit empty managed list serialization.
- Browser: isolated preview of the actual component with synthetic query data, desktop 1280px and mobile 390px reviewed. This is component visual evidence, not a deployed end-to-end test. Temporary preview files and process were removed.
- Full frontend typecheck: feature catalog and architecture checks passed; TypeScript failed on pre-existing frontend/src/session-client-sdk/sessionClient.test.ts:66 (TS2352/TS2493 mock call tuple). That unrelated file was not changed.
- Forge CLI all-phase gate: exit 0, JSON PASSED; executedCheckers is empty, so no static checker passed. The sole executed runtime verifier was API-RUNTIME-001, scenario toolbox-api-tools, HTTP 200 against the existing running service. It does not verify deployment of this change.
- No deployment/restart or remote Yoooni One end-to-end integration was performed. The change remains active due to the full typecheck blocker.

## Evidence

- Local Yoooni One docs/development/client-configuration-guide.md: reusable registration and event activation concept; its draft/revision subsystem is out of scope.
- [Spring Cloud 4.2 context services](https://docs.spring.io/spring-cloud-commons/reference/4.2/spring-cloud-commons/application-context-services.html): EnvironmentChangeEvent rebinding and property removal limitation.

## Open Questions

None blocking implementation. Full remote Yoooni One integration is separate from local refresh verification.
