## ADDED Requirements

### Requirement: Automatic supervised startup attribution

The daily run-supervised.cmd flow SHALL automatically attach launch-specific Maven timing to the running startup snapshot. Full mode SHALL measure package duration independently. Dev mode SHALL label Maven invocation to JVM start as preparation duration, including compilation and fork overhead. The page SHALL display this data without import. Missing or invalid metadata SHALL remain NOT_MEASURED. Hot context reload SHALL not present initial build timing as hot compilation, and replacement JVMs SHALL not inherit obsolete performance properties.

#### Scenario: Normal supervised startup

- **WHEN** the user starts the application through run-supervised.cmd
- **THEN** the running-process page automatically shows Maven timing and runtime milestones without another command

#### Scenario: Build fails

- **WHEN** the full-mode Maven build fails
- **THEN** the wrapper preserves its exit code and does not start Java

#### Scenario: Direct or replacement launch

- **WHEN** there is no valid metadata for this launch
- **THEN** the runtime remains available and build timing is explicitly unmeasured

### Requirement: Visual performance workspace

The system SHALL register a startup performance page using the feature manifest. It SHALL display measured and missing stages, slowest Spring steps, partial tool coverage, refresh and JSON export. It SHALL allow a bounded measurement report import so Maven timing is visible without claiming the runtime measured compilation. Loading, permission and network errors MUST provide recovery.

#### Scenario: Runtime-only view

- **WHEN** the page displays the running server snapshot
- **THEN** Maven build time is labeled not measured and runtime milestones use JVM uptime

#### Scenario: Imported measurement

- **WHEN** a user imports a valid report from the measurement command
- **THEN** the page shows build and runtime observations separately and identifies the view as an imported report

#### Scenario: Invalid report

- **WHEN** the user selects an invalid or oversized file
- **THEN** the page preserves the previous view and explains how to select a valid JSON report

### Requirement: Distinct startup observations

The system SHALL report a unique run ID, JVM/main/Spring/context/ready milestones and first successful synchronous API completion independently. Missing measurements MUST remain explicitly unknown rather than zero. Durations MUST identify their clock origin.

#### Scenario: Ready without a business request

- **WHEN** Spring publishes readiness but no qualifying API request completes
- **THEN** readiness is measured and first API success remains pending

#### Scenario: Failed or excluded request

- **WHEN** a request fails, is asynchronous, or targets diagnostic/health routes
- **THEN** it does not mark first API success

### Requirement: Bounded and private diagnostics

The system SHALL expose a read-only admin-protected startup snapshot with at most 100 slowest Spring steps from a capacity of 2048, parent IDs and saturation metadata. Repeated reads MUST NOT drain evidence. Request secrets and raw dynamic URLs MUST NOT be recorded.

#### Scenario: Repeated diagnostic reads

- **WHEN** an administrator reads the snapshot twice
- **THEN** existing measurements remain available and diagnostic requests do not count as first business API success

### Requirement: Explicit tool readiness coverage

The system SHALL distinguish ready, failed, skipped and unobserved tools and declare partial coverage. Spring readiness MUST NOT imply all tools are ready.

#### Scenario: Optional daemon disabled

- **WHEN** aria2 is disabled
- **THEN** its observation is skipped rather than successful readiness

### Requirement: Repeatable launch measurement

The measurement command SHALL retain Maven build duration and exit code separately from runtime evidence, identify skipped build as not measured, reject a busy port, correlate by run ID, persist failures/timeouts and stop only its owned process.

#### Scenario: Build failure

- **WHEN** Maven exits nonzero
- **THEN** the report records failed build and no successful JVM/readiness stage is fabricated

#### Scenario: Runtime unavailable

- **WHEN** the child exits or does not become ready before the timeout
- **THEN** the report identifies failure or timeout and retains any runtime evidence already captured

#### Scenario: Successful isolated measurement

- **WHEN** a new measured process reaches ready and an optional configured GET succeeds
- **THEN** the report retains both runtime milestones and the external HTTP observation with their separate meanings
