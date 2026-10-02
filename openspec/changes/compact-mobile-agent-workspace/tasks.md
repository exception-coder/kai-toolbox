## Implementation

- [x] 1.1 Integrate mobile Agent Dock with existing queue and OpenSpec controls.
- [x] 1.2 Compact mobile composer and disclose send modes and idle voice on demand.
- [x] 1.3 Verify status, send modes and voice session boundaries; run typecheck, build and quality gate.
- [x] 1.4 Inspect mobile/desktop layout, overflow, scroll and recovery in browser.
- [ ] 1.5 Activate and verify target runtime after explicit restart authorization if required; real-device keyboard and microphone acceptance.

## Evidence

- Frontend: 55 targeted tests passed across 6 files; current source passes typecheck, feature boundaries, full build (including SDK release checks) and final Vite build. OpenSpec strict validation passes. Existing bundle-size warnings remain.
- Browser: existing Vite service, real `/tools/claude-chat` page; no service restart or test message sent to live sessions. At 375×812, message main is 599px (73.8%), Dock 40px and composer 80px; at 320×568 message main is 355px (62.5%), document width equals viewport. Desktop 1440×900 keeps the full supervision/runtime/composer controls.
- Simulated component fixture: explicit queue selection adds only one item; Escape preserves draft and returns focus; queue removal and paused summary work. At 320×568 the bottom sheet scrolls from 453px to reach its 571px content, including the last supervision controls. Resizing to desktop dismisses mobile overlays.
- Native voice baseline had four failing expectations before changes: recovery requires an established connection. Corrected fixtures exposed a real session-switch bug; the recovery hint is now recorded only for the matching session. Media and recovery tests cover connected calls, remount, cancellation, socket loss and explicit dock start.
- Capsule: built stable SDK exposes launcher CSS part; at 375×812 its bottom is 668px, above Dock at 684px and composer at 728px. No console errors observed after fresh loading.
- Forge CLI returns PASSED with 9 API verifiers on the existing backend; `executedCheckers` is empty. This does not verify mobile UI or a newly restarted target version; frontend tests/build and browser inspection provide those separate source-level results.
