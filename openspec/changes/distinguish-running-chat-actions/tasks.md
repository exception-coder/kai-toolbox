## 1. Explicit running actions

- [x] 1.1 Add reusable labeled queue/steer controls with official Codex and attachment eligibility.
- [x] 1.2 Wire main, split and floating composers; Enter queues during an active turn.

## 2. Verification and delivery

- [ ] 2.1 Cover action eligibility and desktop/touch behavior with targeted tests; inspect narrow and desktop layouts. Three targeted tests pass; live preview on port 5173 returned `ERR_EMPTY_RESPONSE`, so visual inspection remains pending.
- [ ] 2.2 Run typecheck and Forge quality gate, validate this change, review scoped diff and commit. Typecheck and strict OpenSpec validation pass; Forge CLI reports PASSED, but its static executedCheckers list is empty and runtime API verifiers do not cover this UI.
