## ADDED Requirements

### Requirement: Controlled SDK upgrade

The system SHALL allow an administrator to check and upgrade an allowlisted bundled npm engine to its registry stable version through the existing dependency panel, with observable progress and a retriable failure result.

#### Scenario: Upgrade succeeds
- **WHEN** an administrator upgrades Codex and installation, schema, compilation and connection checks succeed
- **THEN** the new installed version is reported and the runtime uses the upgraded SDK

#### Scenario: Unauthorized or unsupported request
- **WHEN** a non-administrator requests upgrade or an unsupported engine ID is supplied
- **THEN** no command or dependency mutation occurs

#### Scenario: Concurrent request
- **WHEN** an upgrade is already running
- **THEN** a second upgrade is rejected and the current status remains readable

### Requirement: Preserve runtime and working changes

The system SHALL prepare upgrades separately, prevent new runtime work during activation, reject activation when work is active or uncertain, and restore previous files on failed activation.

#### Scenario: Active work
- **WHEN** there are running turns, pending approvals, background tasks or one-shot work at activation
- **THEN** the old runtime continues and the UI explains that upgrade can be retried after work completes

#### Scenario: Preparation fails
- **WHEN** network, install, protocol or compilation validation fails
- **THEN** current dependencies and runtime remain usable and failure is shown

#### Scenario: Concurrent edit or activation failure
- **WHEN** source files changed during preparation or promoted runtime cannot reconnect
- **THEN** concurrent edits are preserved or original promoted files are restored respectively, and the outcome identifies recovery status
