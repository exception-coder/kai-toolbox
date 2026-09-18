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

### Requirement: Produce bounded semantic recommendations
Forge SHALL offer model-assisted intake with source quotes and structured Top-K classification, validate evidence and target identities, and return candidates for manual review on model failure or deadline expiry.

#### Scenario: High confidence existing target
- **WHEN** a non-ambiguous existing target scores at least 0.85 with a gap of at least 0.12 and valid verbatim evidence
- **THEN** Forge may return an automatic draft but readiness remains blocked until an explicit decision is recorded

#### Scenario: New capability or close candidates
- **WHEN** the model proposes a new capability or insufficient candidate separation
- **THEN** Forge requires confirmation and never automatically creates a capability

### Requirement: Bind source freshness and implementation scope
Forge MUST compare referenced Graphify source bytes against manifest hashes, bind hook sessions to project and branch, and reject implementation files outside the confirmed file list.

#### Scenario: Same timestamp changed content
- **WHEN** a referenced source changes without a timestamp change
- **THEN** the source is stale and cannot contribute verified graph weighting

#### Scenario: Commit contains an unexpected file
- **WHEN** the Git index includes an executable file outside implementationFiles
- **THEN** BEFORE_COMMIT denies with IMPLEMENTATION_SCOPE_DRIFT even when the caller supplied no files

### Requirement: Report measured quality with sample boundaries
Forge SHALL report confirmation-based recall, mapping agreement, corrections, evidence coverage and model-stage latency with sample counts and null values for missing denominators.

#### Scenario: No labeled decisions
- **WHEN** an automatic draft has not been independently confirmed
- **THEN** it does not count as an accurate mapping or proof that production targets were achieved
