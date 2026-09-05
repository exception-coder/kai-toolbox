## Context

The expert brief defines a product showcase, not an administration dashboard. Current implementation coordinates: `frontend/src/shell/types.ts` FeatureManifest; `frontend/src/shell/featureRegistry.ts` automatic registration; `frontend/src/App.tsx` public showcase routing; `frontend/src/components/ui/sheet.tsx` accessible drawers; `frontend/src/features/claude-chat/pages/ChatPage.tsx` session delegation tab; assistant-integration and reqpool manifests provide real destinations. Graphify manifest predates current working changes, so targeted source reads are authoritative for these coordinates.

## Goals / Non-Goals

Goals: value-first introduction, two featured abilities, category browsing, detail-to-tool navigation, responsive and keyboard-accessible presentation.

Non-goals: backend registration, task execution, changing homepage, new dependencies, fake statistics, search or recommendation engines.

## Decisions

- Isolate presentation in `features/forge-explore`, with a typed editorial catalog, mini visuals, explorer, detail component and page composition. No cross-feature implementation imports.
- Register `/explore` with `layout: showcase`, `group: AI`, early order. Public explanatory content works without API responses. Existing protected destinations retain their guards.
- Reuse existing semantic theme tokens and Sheet. Registry exists but no project binding or established core tokens: conservative reuse of current UI with the expert's deliberate showcase composition. Use asymmetric featured blocks, neutral editorial type, fine rules, native HTML/CSS diagrams and mobile reflow.
- Each capability uses an actual route with explicit instructions where there is no direct deep link. Rainbow introduces the embedded assistant and links to integration; delegation links to Vibe Coding and tells users to select a session then 委托. Do not pretend a task has been created.
- Drawer uses modal focus trapping, Escape and focus restoration. Reference checked 2026-09-05: [Radix Dialog](https://www.radix-ui.com/primitives/docs/components/dialog). Existing installed wrapper is compatible; no upgrade required.

## Risks / Trade-offs

- Editorial copy drift → central catalog and verified destinations; no unsupported knowledge-graph menu.
- Public page linking protected features → describe entry prerequisites; existing authentication stays authoritative.
- Existing working tree has extensive unrelated changes → new isolated feature, no cleanup of other work; distinguish baseline verification failures.

## Migration Plan

Normal frontend build discovers the manifest. Rollback by removing the feature directory and rebuilding. No data migration. Verify typecheck/build, interaction tests, desktop/mobile/light/dark browser renders and Forge quality gate. Keep change active if repository-wide checks are blocked.

## Open Questions

None.

## Delegation Manual Extension

### Vibe Coding Capability Manual

Extend the guide with a session capability map and progressive disclosure inventory. Separate Forge tool callbacks, optional business integrations, engine-provided capabilities and frontend workspaces. Document exact tool paths and registration-only semantics; compare direct Codex use by integration ownership rather than asserting native feature absence. Resolve effective capabilities through the existing runtime capability panel.

Place supervision and constrained delegation under `/explore/vibe-coding`, linked from coding capability details and the delegation manual. Reuse existing editorial guide layout and responsive three-node diagrams. Explain the server feedback loop, APPLY through DONE phases, separate grant/tool enforcement and human handoff. Reference current implementation rather than treating the commit title or Agent reports as acceptance evidence.

### Spring Boot Relay Onboarding

Extend quick start with a Spring Boot Starter mode alongside no-code and direct SDK modes. Source of truth: `sdk/forge-session-relay-spring-boot-starter/README.md`, its pom, properties, auto-configuration, participant resolver, binding store and controller, plus updated SessionClientOptions. Explain browser → same-origin business Spring Boot → Forge → Agent, owner login versus business Principal mapping, server-only credentials, `/pair`, optional getAccessToken and configured apiPath. Include Maven coordinates, both server configurations, resolver contract, typechecked inert frontend sample and production store/authentication requirements. No runtime implementation changes or claims of relay E2E verification.

Add `/explore/delegation` to the same public manifest and link from delegation details. Keep all documentation presentation and editorial content within forge-explore. Reuse existing tokens, Sheet and Button; use semantic HTML/CSS architecture and sequence diagrams with selectable scenarios, avoiding an extra diagram dependency. New components separate responsibilities, protocol scenarios, quick start/code copying and recovery reference.

Implementation evidence: `SessionDelegationController` owns create/list/pause/resume/revoke/reissue/audit; `SessionClientController` owns invitation exchange, summary, projected history, attachments and connection tickets; `SessionAccessGrant` binds participant/session/profile/expiry/quotas; `SessionClientCommandService` accepts constrained participant commands; `SessionClientEventProjector` filters internal event types; `frontend/src/session-client-sdk/types.ts`, `sessionClient.ts`, `README.md` and `vite.session-client.config.ts` define the actual SDK and local packaging flow. Graphify remains stale for these untracked/new files; direct source reads supplement existing graph results.

Important semantics: delegation grants access to an existing session, not a standalone task scheduler. Participant answers business questions only; risky approvals remain with the owner. SDK send returns a command ID, not completion. REST uses a grant bearer token and WS uses a short-lived single-use ticket. Invitation exchange is outside SDK and requires participant Forge login. Replay gaps require explicit history recovery. Pending commands/watermarks use storage keyed by origin; recommend a grant-scoped storage adapter for custom clients. No automatic token refresh is promised.

Quick start offers no-code `/session-client` entry plus actual local ESM package build/install, server prerequisites and a typechecked sample displayed as source. Copy failure keeps selectable code with a recovery message. Examples never execute commands, exchange credentials or connect from the public manual. Documentation records that full Agent and enterprise ingress acceptance remain pending in delegated-session-client-sdk; this change verifies documentation/UI and sample typing, not that separate feature's deployment.

Validation: targeted document interactions, code copy success/failure, scenario switching, all routes, sample typecheck, desktop/mobile/light/dark browser evidence, frontend build and existing Forge gate. Rollback removes new manual components/route and the optional catalog manual link without changing delegation runtime.
