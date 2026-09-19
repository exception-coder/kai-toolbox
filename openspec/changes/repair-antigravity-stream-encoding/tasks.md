## 1. Authoritative transcript reconciliation

- [x] 1.1 Add a bounded, path-safe UTF-8 Antigravity transcript reader for the current conversation and cover valid, stale, malformed, and invalid-ID inputs.
- [x] 1.2 Accumulate live assistant text and emit a full-text snapshot only when the current transcript differs; warn when damaged text cannot be reconciled.

## 2. Unified session event

- [x] 2.1 Add the ordered `assistantSnapshot` event to the Sidecar-to-Java and Java-to-browser contracts with replay-safe mapping tests.
- [x] 2.2 Replace only the current non-voice assistant draft in the React session reducer and add focused regression tests.

## 3. Verification and delivery

- [x] 3.1 Run Sidecar, Java, and frontend targeted tests plus typecheck/build and OpenSpec strict validation.
- [x] 3.2 Run the applicable Forge quality gate, review the scoped diff, and commit without restarting services.

## 4. Startup recovery and background completion

- [x] 4.1 Classify only pre-acceptance Antigravity authentication/eligibility failures as retryable and add bounded retry coverage.
- [x] 4.2 Detect progress-only background-task handoffs, resume the same conversation within shared limits, and fail visibly when continuation does not converge.
- [x] 4.3 Run Sidecar regression/build, strict OpenSpec validation and the applicable Forge gate; commit without restarting services. Sidecar source compilation passed; production `dist` promotion and runtime verification remain pending explicit restart authorization because port 18890 is active.
