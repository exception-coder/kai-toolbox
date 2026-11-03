## ADDED Requirements

### Requirement: Poll and prepare separately from restart
The updater SHALL default to a five-minute interval and a manual restart policy, retaining explicit daily scheduling and the existing single Java update owner.

#### Scenario: No remote update
- **WHEN** fetched origin/main has no fast-forward candidate
- **THEN** the updater does not build, stash or restart

#### Scenario: Candidate ready with manual policy
- **WHEN** the independent immutable candidate build passes and restart policy is manual
- **THEN** it reports the candidate ready without changing the main worktree or restarting

### Requirement: Observe idle without withholding admission
An explicitly enabled idle policy SHALL require five minutes of safe observations with no intervening Agent admission, no running or uncertain work, no pending authorization and no persisted queued messages. It SHALL perform final validation under the existing admission drain.

#### Scenario: A short task finishes between observations
- **WHEN** a task is admitted after the first idle observation but finishes before the next
- **THEN** the admission generation resets the quiet window and new tasks remain admissible

#### Scenario: Remote changes during preparation
- **WHEN** final fetch or HEAD verification differs from the validated candidate
- **THEN** the updater releases admission and restarts candidate observation without merging

### Requirement: Preserve local changes and recovery evidence
The updater SHALL use native stash only for tracked changes after final safety checks, fast-forward to the validated SHA without overwriting ignored files, and restore the immutable stash with index state. Untracked files and stash backups SHALL remain preserved.

#### Scenario: Restore conflicts or is interrupted
- **WHEN** stash identity or restoration cannot be confirmed
- **THEN** a Git-private recovery record blocks repeated application and restart while the backup remains available

#### Scenario: Untracked or ignored path collides
- **WHEN** the candidate would replace an existing local untracked or ignored path
- **THEN** Git rejects fast-forward, local tracked changes are restored, and no restart occurs

#### Scenario: Restart handoff fails
- **WHEN** an attempted handoff fails or times out
- **THEN** the updater restores task admission, retains the pending version and requires explicit confirmation before another restart
