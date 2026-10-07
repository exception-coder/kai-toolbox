## ADDED Requirements

### Requirement: Persistent unknown runtime state stops dispatch safely
Runtime SHALL pause automatic dispatch after at least three unreachable or stale state observations spanning at least sixty seconds in one run generation. It SHALL preserve task progress, user messages and active engine execution, and expose the reason and recovery action.

#### Scenario: Sidecar remains unreachable
- **WHEN** repeated runtime observations satisfy both thresholds
- **THEN** Runtime persists PAUSED with a version check and removes internal continuation messages

#### Scenario: Engine is legitimately busy
- **WHEN** a coherent runtime snapshot reports an active turn
- **THEN** no infrastructure failure is counted and the previous failure window is cleared

#### Scenario: The user resumes
- **WHEN** the original run resumes with a new generation
- **THEN** the previous generation's failure count is not reused and dispatch still requires a fresh admissible runtime state

### Requirement: Codex input transport failure settles its owner
The Codex adapter SHALL route synchronous and asynchronous stdin failures to the owning RPC lifecycle rather than relying on process-level exception recovery.

#### Scenario: Input pipe fails during a turn
- **WHEN** stdin write fails
- **THEN** pending requests are rejected through the existing turn failure path and an accepted turn is not automatically replayed

#### Scenario: A late error arrives after completion
- **WHEN** a pipe error arrives after the turn has settled
- **THEN** the error is consumed without replacing the completed result
