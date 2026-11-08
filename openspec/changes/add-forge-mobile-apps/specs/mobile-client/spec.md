## ADDED Requirements

### Requirement: Installable clients preserve the existing Forge workspace
The system SHALL provide Android and HarmonyOS native client projects that reuse the configured HTTPS Forge workspace, preserve existing server-owned sessions, queues and execution semantics, and report missing SDKs, signatures or artifacts without claiming an installable delivery.

#### Scenario: Build without required tools
- **WHEN** a developer builds a mobile client without its SDK or required signing configuration
- **THEN** the build fails with the missing prerequisite and does not deliver an old, empty or unsigned file as an installable release

#### Scenario: Open a native client
- **WHEN** the signed client is installed and its Forge service is reachable
- **THEN** the user can log in and use the same registered projects, server sessions and queues; no browser login or draft migration is assumed

### Requirement: Native operations are limited to the trusted workspace
The clients SHALL restrict native messages to the configured HTTPS origin and the documented versioned capability methods, validate payload limits on the native side, and keep ordinary browser behavior available.

#### Scenario: Untrusted content attempts a native operation
- **WHEN** another origin, unsupported method or invalid payload attempts a native call
- **THEN** no native operation executes and no privileged bridge is exposed to that origin

#### Scenario: Copy or share generated cards
- **WHEN** the user invokes copying or sharing from the existing card workflow in a mobile client
- **THEN** the complete supported image set is copied to the native clipboard or handed to the system share UI, without automatically saving to the gallery or claiming delivery to a recipient

#### Scenario: Selection is cancelled or a result is unknown
- **WHEN** the user cancels a file picker or a native result times out
- **THEN** the draft is preserved, cancellation or unknown result is distinguished from success, and the operation is not automatically replayed
