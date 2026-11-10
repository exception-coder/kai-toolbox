## Why

Business hosts already have Java Relay SDK credentials. Rainbow capsule integration should use those credentials and the host login rather than requiring a second Forge login or invitation.

## What Changes

- Add host connection-ticket and authenticated-fetch adapters to the JS capsule SDK.
- Extend the Java Relay starter with capsule REST and WebSocket forwarding, preserving its legacy default mode.
- Authenticate client plus host participant at the Forge boundary and pin readonly consultation to the client project.
- Reuse validated structured requirement drafts and one-sentence copy actions.

## Capabilities

### New Capabilities

- `host-capsule-sdk`: Host-authenticated capsule connection and ownership boundary.

## Impact

Cross-project authentication contract: Forge assistant-sdk, Java starter, auth ownership service, capsule gateway and Yoooni One consumer. Internal capsule identities are created automatically; no login credentials are issued. Existing sessions and delegation records are retained.
