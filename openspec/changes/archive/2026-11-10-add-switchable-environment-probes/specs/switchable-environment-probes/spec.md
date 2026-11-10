## ADDED Requirements

### Requirement: Selectable environment probe engines

The system SHALL support java and go engines through the existing environment endpoint, default to java, preserve shared readiness rules, and reject unknown engines without fallback.

#### Scenario: Equivalent inputs
- **WHEN** either engine returns the same command outcomes
- **THEN** shared evaluation produces the same dependency states, versions and blocking counts.

#### Scenario: Go unavailable
- **WHEN** the selected Go executable is missing or its protocol is invalid
- **THEN** the request fails explicitly and the UI offers retry or selecting Java.

### Requirement: Bounded concurrent probes

Both engines SHALL inspect the same 11 fixed version commands with at most four concurrent commands, bounded output, individual timeouts and process cleanup. The system SHALL distinguish missing commands from timeout or execution errors.

#### Scenario: Slow command
- **WHEN** a command exceeds its deadline
- **THEN** it is terminated and reported as attention without preventing other command results.

#### Scenario: Missing executable
- **WHEN** a fixed command cannot be resolved
- **THEN** only the associated dependency is marked missing.

### Requirement: Transparent comparison

The UI SHALL provide engine selection even during initial loading or failure, and a sequential fresh comparison displaying engine, overall and per-command timings, timestamps and state differences. Shared Java checks SHALL be disclosed.

#### Scenario: Compare engines
- **WHEN** the user starts comparison
- **THEN** both engines execute fresh local probes sequentially with remote fetch disabled, and partial failure retains the successful measurement.

#### Scenario: Change selection
- **WHEN** the user selects another engine
- **THEN** cached data and pending responses remain isolated by engine and the selected implementation is identified.

#### Scenario: Installation in progress
- **WHEN** installation or update is active
- **THEN** comparison and engine switching are disabled and operation completion refreshes the correct environment result.
