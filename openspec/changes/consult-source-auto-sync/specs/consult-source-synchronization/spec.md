## ADDED Requirements

### Requirement: Synchronize an authorized repository before source exploration
The system SHALL attempt server-owned safe synchronization before consultation source reads, context, searches or history lookups, selecting only a currently authorized project identity. GET discovery SHALL remain read-only. The model SHALL NOT gain arbitrary Git commands or directory selection.

#### Scenario: Clean repository behind its configured upstream
- **WHEN** an active consultation explores a clean authorized repository with incoming fast-forward commits
- **THEN** the existing Git service fetches its configured upstream and updates to the checked fixed commit without stash, reset or rebase
- **AND** the tool revalidates authorization and paths after synchronization and reports the check status, time and commit before reading

#### Scenario: Local edits, divergence or unavailable synchronization
- **WHEN** local changes, divergence, missing upstream, credentials or networking prevent safe synchronization
- **THEN** local contents are preserved and the tool states that local evidence is not confirmed as current
- **AND** a non-Git directory never causes an ancestor repository to be updated

#### Scenario: Concurrent checks or unknown execution result
- **WHEN** another check is running or the HTTP execution result is unknown
- **THEN** the current source read stops with an explicit retryable state and does not race an ongoing repository update
- **AND** completed project checks are reused for five minutes while every call still validates current access

#### Scenario: Archived or unauthorized consultation
- **WHEN** the runtime signature is invalid, the project is outside current scope, or the consultation is archived
- **THEN** synchronization is rejected before any Git operation

#### Scenario: Source update does not certify other evidence
- **WHEN** synchronization succeeds or a cached check is reused
- **THEN** the result does not certify Graphify freshness, initialized profiles or deployed production code
