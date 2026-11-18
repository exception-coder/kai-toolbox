## ADDED Requirements

### Requirement: Upgrade selected built-in SDKs as one batch
The system SHALL allow administrators to select multiple supported built-in SDKs and perform one isolated installation, verification and activation for all selected packages requiring an update. Existing single-engine requests SHALL remain compatible. Unsupported or empty selections SHALL be rejected before work starts. Existing administrator, task mutual exclusion, activity, maintenance and rollback protections SHALL remain enforced.

#### Scenario: Multiple selected SDKs need updates
- **WHEN** an administrator submits Codex and Claude and both have newer stable versions
- **THEN** the system installs both fixed package versions in one workspace and activates the verified workspace once

#### Scenario: A selected SDK is current or newer
- **WHEN** a selected SDK is already at or above the latest stable version
- **THEN** it is skipped, and a selection containing no updates completes without reconnecting the runtime

#### Scenario: A selected version cannot be resolved
- **WHEN** any selected SDK has no resolvable stable target version
- **THEN** the entire batch fails before installation and preserves the running version

#### Scenario: Verification or activation fails
- **WHEN** batch verification fails or activation cannot connect the new runtime
- **THEN** the system preserves the current files before activation or restores the original workspace using the existing rollback flow, and reports failure or unconfirmed recovery honestly

#### Scenario: Mobile selection and reopening
- **WHEN** an administrator selects SDK checkboxes or reopens the panel during a running batch
- **THEN** the panel submits all selected identifiers in one request or restores the active selection and status, disables duplicate submission and retains a refresh recovery action

#### Scenario: Runtime inventory and upgrade eligibility differ
- **WHEN** the team dependency panel lists session engines, including unavailable engines
- **THEN** both sections show the same engine inventory and identify the upgrade method, and selecting all submits only SDKs supported by the batch endpoint
