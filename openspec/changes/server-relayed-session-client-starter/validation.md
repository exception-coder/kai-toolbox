

## Forge-owned workbench migration · 2026-09-06

The entire UI, state projection/lifecycle, requirements model and tests now live in Forge frontend/src/session-client-sdk/react. Yoooni One ForgeRelayPanel only imports the package, provides stable authenticated adapter and system/module context. The SDK publishes separate React and style.css subpaths; protocol entry does not import React. Generated public types use explicit contracts rather than exposing schema-library types. Built CSS selectors are scoped and package build asserts exports, React boundary and CSS isolation.

Validation: session-client:build passed with declarations and package contract gate; SDK 21 tests passed (13 workbench and 8 transport); Yoooni host integration 7 tests passed. Yoooni scripts/verify.ps1 exit 0, frontend 62 files/174 tests passed and backend reactor passed (16 Docker-dependent tests skipped). Final host production build and scoped regression repeated after final SDK/style changes and passed. Existing large bundle warning remains.

Independent browser consumer imports only built SDK JavaScript/CSS and React, with explicit sample adapter and procurement module labels, no host styles or Tailwind plugin. Desktop 1329px and mobile 390x844 render correctly, computed document width matches viewport; input border verified 1px and composer stays visible. Viewport restored. Two-instance label IDs and contextual text covered by SDK tests.

Forge full typecheck still reports only existing sessionClient.test.ts:66 TS2352/TS2493; SDK declarations pass separately. Forge Quality Gate exit 0/status PASSED, executedCheckers empty and 9 configured API runtime checks passed; this does not prove real Relay interaction for the new UI.

No registry publication, git commit or deployment. Live model output and authentication path were not exercised by the sample preview. Existing remaining real-session acceptance tasks stay open; no archive.
