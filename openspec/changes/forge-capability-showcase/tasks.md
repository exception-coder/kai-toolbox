## 1. Implementation

- [x] 1.1 Register public showcase and implement typed, source-verified capability catalog.
- [x] 1.2 Compose hero, asymmetric featured visuals, category explorer and accessible detail drawers.

## 2. Verification

- [x] 2.1 Verify filters, drawer keyboard recovery and destination links with focused tests.
- [x] 2.2 Verify desktop/mobile and light/dark rendering in a real browser, including unavailable backend.
- [x] 2.3 Run frontend typecheck/build and Forge quality gate; record baseline blockers accurately.
- [x] 2.4 Validate OpenSpec and record final implementation evidence.

## 3. Evidence

- `ExplorePage.test.tsx`: 3 tests passed, including filter reset, Escape focus restoration and accurate destinations.
- Browser: 1440×1080 desktop, 375×812 mobile, light/dark, drawers, workspace navigation and all API requests aborted. No page errors or horizontal overflow. Local screenshots and results: `.codex-work/forge-explore-qa/`.
- Forge CLI: exit 0, JSON `PASSED`; `executedCheckers: []`, so no static checker was run. Only `API-RUNTIME-001` executed, returning HTTP 200.
- Frontend typecheck and final `npm run build` passed (exit 0), including feature boundaries and catalog consistency. Vite reports large-chunk warnings for existing application bundles; the showcase is lazy-loaded.
- OpenSpec strict validation passed with no issues. Completeness, source/destination correctness and design coherence reviewed. Change remains active for product review; no deployment or archive requested.

## 4. Delegation Manual

- [x] 4.1 Add manual route and truthful delegation copy with server/client responsibility and protocol diagrams.
- [x] 4.2 Add no-code and SDK quick start, typechecked example, interface reference and recovery guidance.
- [x] 4.3 Test navigation, scenario selection and clipboard success/failure; inspect responsive browser renders.
- [x] 4.4 Run build and quality verification and record manual evidence without claiming runtime E2E acceptance.

## 5. Manual Evidence

- [x] 5.7 Inventory session capabilities from ChatPage, SessionCapsPanel, sessionManager, codexMcpPolicy, forgePendingSql and toolboxMcpBridge; add visual map, four tool contracts, optional integrations, seven workspace groups and qualified Codex comparison.
- Catalog verification: desktop/mobile, disclosure interaction and blocked APIs passed without page errors. Typecheck blocked by existing sessionClient.test.ts:66 TS2352/TS2493; feature catalog and boundaries passed. Forge CLI exit 0/PASSED with no executed static checkers and only API-RUNTIME-001. No live database, MCP or Agent runtime acceptance claimed.

- [x] 5.6 Add source-verified Codex App Server notification-to-continuation implementation flow: thread/turn filtering, terminal assessment, result normalization, Java settled event, MCP report side input, runner decision and gated queue release. Desktop render and mobile overflow check passed; no real Agent E2E claimed.

- [x] 5.5 Present a single overview flow by default and collapse detailed technical sections. Desktop screenshot inspected and 375px overflow check passed; diagram shows document, persisted binding, Agent, feedback and three outcomes.

- [x] 5.4 Explain OpenSpec document roles, CLI snapshot parsing, Agent reading and execution feedback, with explicit evidence limitations. Browser check passed for eight diagrams at 1440/375 widths, blocked APIs, cross-links and no page errors.

- [x] 5.2 Add Vibe Coding parent manual with supervision feedback loop, phase evidence, permission chain and delegation cross-links, grounded in f7a8055b and current source.
- [x] 5.3 Complete Vibe Coding browser acceptance once frontend dependencies and local preview are restored.
- Binding extension: added API-to-database, internal-queue-to-Agent and MCP-to-runtime diagrams with exact fields, optimistic locking, prompt limitations and file-isolation boundaries. Browser now passes 1440/375 layouts, six diagrams, blocked APIs, cross-links and no page errors. Full typecheck remains blocked only by SDK test line 66 (TS2352/TS2493).
- Vibe Coding extension: diff whitespace check passed. Typecheck blocked by SDK test line 66 and missing trusted-types; preview refused connection, and dev startup failed because node_modules/typescript was missing. No browser pass or production build is claimed. Forge CLI exit 0/PASSED, executedCheckers empty, only API-RUNTIME-001 executed.

- [x] 5.1 Add source-verified Spring Boot Starter onboarding, diagram and TypeScript client example; verify tests and browser rendering.

- Starter extension: 7 focused page tests passed; desktop/mobile browser rendering passed with blocked APIs, no page errors or horizontal overflow (`.codex-work/relay-guide-qa/`). Standalone Vite build passed. Full typecheck/build is currently blocked by unrelated `session-client-sdk/sessionClient.test.ts:66` mock argument typing errors (TS2352/TS2493); no errors were reported in the guide. Forge CLI returned exit 0/PASSED with no static checkers and only API-RUNTIME-001 executed. Relay runtime E2E is not claimed.

- `ExplorePage.test.tsx` and `DelegationGuidePage.test.tsx`: 6 tests passed. Covers manual link, role diagrams, scenario switching, inert SDK examples, exact code copying and failed clipboard recovery.
- `npm run build`: exit 0; TypeScript includes both displayed source examples, catalog consistency and architecture boundaries passed. Existing large-chunk warnings remain.
- Browser screenshots/results at `.codex-work/delegation-guide-qa/`: 1440×1000 and 375×812; light/dark, drawer-to-guide navigation and return, scenario selection, SDK mode, clipboard success/failure, blocked APIs; no horizontal overflow or page errors.
- Forge CLI: exit 0 and PASSED; no static checker executed; API-RUNTIME-001 alone returned HTTP 200. This is not delegation runtime E2E verification.
- Actual Agent flow and enterprise ingress remain pending under delegated-session-client-sdk tasks 8.1/8.2. No backend, SDK runtime, credentials, grants or deployment changed by the manual.
