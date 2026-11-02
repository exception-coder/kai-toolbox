## Purpose

为业务应用提供受控、可追溯的后端分析接口。

## ADDED Requirements

### Requirement: Administrator application credential management
The platform SHALL provide an administrator-only management page at /tools/fore-consult/access, linked from existing consultation settings. Metadata SHALL exclude plaintext credentials, credential digests and tokens. The page SHALL support issuing, rotating/renewing and revoking existing application grants, with explicit confirmation and a one-time copy/download result kept only in transient component memory.

#### Scenario: Local instance setup and denied access
- **WHEN** an administrator prepares application access on their own Forge instance, including while analysis is disabled
- **THEN** the page shows that instance's enablement and grant scope; application authentication still requires enablement, and ordinary users and service tokens cannot manage grants.

#### Scenario: Repeated issuance and lost response
- **WHEN** issuance is repeated with the same administrator and Idempotency-Key, or a write response is uncertain
- **THEN** duplicate issuance is rejected without redisplaying the secret, no automatic write retry occurs, metadata can be refreshed, and a lost secret is recovered only by an explicit rotation. Independent grants remain compatible.

### Requirement: Application credentials and tenant scope
The service SHALL accept only independently provisioned application credentials bound to one tenant and an administrator-approved project scope. User tokens SHALL NOT authenticate this API and service tokens SHALL NOT grant access to user APIs.

#### Scenario: Rotation and isolation
- **WHEN** a credential is rotated, revoked, expired, or a caller requests another tenant's task
- **THEN** old tokens or unauthorized task access are rejected without disclosing task content.

### Requirement: Durable idempotent analysis
The service SHALL persist bounded task input, status and result; identical client/request keys SHALL resolve to one task and changed input SHALL conflict.

#### Scenario: Timeout or process interruption
- **WHEN** submission times out or the process restarts during execution
- **THEN** the original key resolves to the original task, interrupted execution is explicit, and no business question is automatically replayed.

### Requirement: Read-only structured analysis
The service MUST use the existing business consultation account policy and Agent runner with tools disabled, validate structured output and evidence references, and never send messages or perform business mutations.

#### Scenario: Missing evidence or invalid model output
- **WHEN** evidence is absent or model output is invalid
- **THEN** evidence gaps or a recoverable failed task are returned, not fabricated evidence or a claim that a repair occurred.

### Requirement: Cancellation and bounded execution
The service SHALL separate cancellation requests from confirmed termination and keep concurrency bounded until workers exit.

#### Scenario: Late output after cancellation
- **WHEN** output arrives after cancellation or timeout was requested
- **THEN** it cannot overwrite the cancellation outcome as success.
