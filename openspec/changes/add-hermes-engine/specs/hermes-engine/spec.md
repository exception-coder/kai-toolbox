## ADDED Requirements

### Requirement: Honest Hermes admission
Forge SHALL expose Hermes as experimental only after its own ACP initialization proves identity, protocol and load capability.

#### Scenario: Missing runtime
- **WHEN** no compatible official runtime is available
- **THEN** Hermes is not selectable and Forge reports the runtime gap without model calls or automatic installation

### Requirement: Preserve native policy and exact identity
Forge SHALL map only verified permission modes and load only its bound native session.

#### Scenario: Unsupported request
- **WHEN** restricted policy, model override or image input is requested
- **THEN** no native prompt starts and the unsupported capability is reported

#### Scenario: Missing original session
- **WHEN** session/load fails
- **THEN** no replacement session or implicit latest-session resume is attempted

#### Scenario: Permission approval
- **WHEN** Forge approves a native permission request
- **THEN** only an offered allow_once option may be selected, never permanent approval

### Requirement: Cancellation and uncertain work are distinct
Forge SHALL persist a per-native-session in-flight guard and release it only for an authoritative terminal or a failure before sending.

#### Scenario: Lost prompt or unknown cancellation
- **WHEN** transport closes or cancellation cannot settle the prompt
- **THEN** the guard survives reconnect and subsequent prompts are rejected pending native verification

#### Scenario: Confirmed native cancellation
- **WHEN** the original prompt returns cancelled
- **THEN** Forge reports interruption and releases its guard without claiming daemon-wide shutdown
