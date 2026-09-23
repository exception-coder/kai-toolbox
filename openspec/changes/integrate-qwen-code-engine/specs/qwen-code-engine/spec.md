## ADDED Requirements

### Requirement: Qwen Code is an independent engine
Forge SHALL expose Qwen Code as a separately identified engine backed by the official Qwen Code SDK and SHALL NOT represent QwenWork desktop automation as part of that engine.

#### Scenario: Select Qwen Code
- **WHEN** the Sidecar reports the Qwen Code engine as selectable
- **THEN** the user can create or switch a session to Qwen Code without selecting another provider engine

#### Scenario: Keep QwenWork boundary explicit
- **WHEN** Forge describes the Qwen engine or its SDK
- **THEN** it identifies Qwen Code and does not claim that QwenWork desktop tasks can be externally managed

### Requirement: Qwen sessions resume idempotently
Forge SHALL persist the Qwen native session identity after its first successful initialization and SHALL reuse that identity for subsequent turns in the same Forge session.

#### Scenario: First Qwen turn
- **WHEN** a Forge session sends its first Qwen turn without a native session identity
- **THEN** Forge starts one Qwen session and persists the returned identity

#### Scenario: Later Qwen turn
- **WHEN** the same Forge session sends another Qwen turn with a persisted native identity
- **THEN** Forge resumes that Qwen session instead of creating a duplicate

### Requirement: Qwen events use the Forge protocol
Forge SHALL translate supported Qwen assistant, tool, completion, interruption, and failure messages into the existing public Agent event contract and MUST NOT expose provider-native message objects across the Sidecar boundary.

#### Scenario: Stream assistant output
- **WHEN** Qwen emits incremental assistant content
- **THEN** Forge streams ordered assistant deltas to the current turn

#### Scenario: Report tool activity
- **WHEN** Qwen starts and completes a tool call
- **THEN** Forge emits correlated tool activity and result events using a stable tool call identity

#### Scenario: Ignore an unknown native message safely
- **WHEN** the SDK emits a message type not represented by the public Agent protocol
- **THEN** Forge keeps the provider object internal and does not corrupt or prematurely complete the turn

### Requirement: Qwen execution respects Forge controls
Forge SHALL support cancellation and MUST constrain Qwen tool use to the current Forge permission and tool policy.

#### Scenario: Interrupt a running turn
- **WHEN** the user interrupts an active Qwen turn
- **THEN** Forge aborts the SDK query and reports the turn as interrupted without starting a replacement engine

#### Scenario: Tool approval is required
- **WHEN** Qwen requests a tool action that the current Forge policy does not automatically allow
- **THEN** Forge uses the existing permission decision path before the tool can execute

### Requirement: Qwen failures are recoverable and isolated
Forge SHALL report Qwen dependency, authentication, resume, and execution failures with actionable diagnostics and MUST NOT silently fall back to Codex, Claude, OpenCode, or another engine.

#### Scenario: Qwen authentication is unavailable
- **WHEN** the Qwen SDK cannot start because local authentication or provider configuration is unavailable
- **THEN** Forge reports a Qwen-specific recovery message and leaves other engine sessions unchanged

#### Scenario: Qwen turn fails
- **WHEN** the Qwen SDK reports a terminal failure
- **THEN** Forge closes the current turn as failed and preserves the session for an explicit retry or engine change

### Requirement: Qwen SDK participates in version management
Forge SHALL report the installed and available version of `@qwen-code/sdk` through the existing Sidecar SDK version interface and SHALL use the same verified upgrade workflow as other managed SDK engines.

#### Scenario: Inspect SDK versions
- **WHEN** an administrator opens Sidecar SDK version management
- **THEN** Qwen Code appears with its package identity and installed/latest version state

#### Scenario: Upgrade Qwen SDK
- **WHEN** an administrator requests a Qwen SDK upgrade
- **THEN** Forge updates the isolated Sidecar workspace and accepts the upgrade only after the existing build verification succeeds
