## 1. Configuration and authentication

- [x] 1.1 Register Relay configuration and validate independent managed clients while retaining legacy deployment compatibility.
- [x] 1.2 Refresh authentication snapshots on the existing event path, including deletion and reset.
- [x] 1.3 Make configuration candidate validation and persistence failure preserve the active values.

## 2. Existing configuration page

- [x] 2.1 Add a Relay editor using the existing configuration CRUD API with independent client rows and recoverable errors.

## 3. Verification

- [x] 3.1 Verify real service/event persistence lifecycle, independent authentication, rotation, disable, deletion, empty list and restart.
- [x] 3.2 Verify frontend editor and representative browser states.
- [x] 3.3 Run Forge quality gate, strict OpenSpec validation and record actual results and limitations.
- [ ] 3.4 Full frontend typecheck passes after the existing sessionClient.test.ts:66 mock typing issue is resolved in its owning change.
