## ADDED Requirements

### Requirement: Trae is an independently probed engine
Forge SHALL identify TraeCode CLI separately and SHALL allow selection only after the local CLI 2.0 probe succeeds.

#### Scenario: CLI is absent
- **WHEN** the Sidecar cannot execute TraeCode CLI 2.0
- **THEN** the catalog reports a non-selectable Trae entry with an installation diagnostic

### Requirement: Trae session identity is isolated
Forge SHALL persist a Trae native session identity under the current Forge session and MUST NOT implicitly resume the latest CLI session.

#### Scenario: Continue a Forge conversation
- **WHEN** the current Forge session has a persisted Trae native identity
- **THEN** the next turn explicitly resumes only that identity

### Requirement: Trae failures and permissions remain explicit
Forge SHALL use a workspace-constrained default, read-only planning, and opt-in unrestricted mode, and SHALL report a failed CLI turn without switching provider.

#### Scenario: CLI exits without a final answer
- **WHEN** the CLI exits nonzero or provides no supported assistant result
- **THEN** Forge marks the turn failed and shows a CLI-specific recovery diagnostic
