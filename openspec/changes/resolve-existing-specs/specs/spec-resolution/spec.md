## ADDED Requirements

### Requirement: Retrieve existing requirement evidence
Forge SHALL return bounded Requirement and Scenario candidates for individually identified atomic inputs, with source paths, content revision and Graphify freshness, without treating code facts as accepted behavior.

#### Scenario: Existing capability is found
- **WHEN** an Agent resolves a batch with relevant business terms
- **THEN** each item has independent ranked candidates and full source requirement evidence

#### Scenario: Graph is missing or stale
- **WHEN** Graphify cannot establish fresh evidence
- **THEN** textual retrieval remains available and the graph limitation is explicit

### Requirement: Persist validated decisions idempotently
Forge MUST bind resolutions to project, branch, change, input and current specification revision, validate closed classifications and target identities, and preserve actor, reason and timestamp for decisions.

#### Scenario: Repeated input
- **WHEN** identical normalized inputs are resolved in the same context
- **THEN** the same resolution is returned without creating another delta

#### Scenario: Incomplete or stale decision
- **WHEN** an item is unconfirmed, its target is invalid or formal specs changed
- **THEN** readiness denies implementation with a recovery code

### Requirement: Guard delta scope and conflicts
Forge SHALL verify confirmed delta content, reject duplicate or conflicting requirement targets and produce draft text without modifying formal specifications.

#### Scenario: Modified existing requirement
- **WHEN** a confirmed MODIFIED decision supplies complete requirement and scenario text
- **THEN** its proposed delta uses the existing title and readiness checks the actual change delta against it

#### Scenario: No specification change
- **WHEN** an Agent records NO_SPEC_CHANGE with a concrete reason
- **THEN** no empty delta is required

### Requirement: Share readiness across adapters
Forge MUST expose the same resolution service through SDK and stdio MCP plus a JSON CLI. Plugin hooks SHALL only adapt lifecycle context and enforce structured readiness, with configurable failure behavior.

#### Scenario: Forge unavailable
- **WHEN** a configured blocking hook cannot obtain a valid readiness result
- **THEN** it denies the operation and reports a recovery action
