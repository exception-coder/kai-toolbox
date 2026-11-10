## ADDED Requirements

### Requirement: Versioned workflow editing
The system SHALL allow administrators to configure ordered consultation nodes with enablement, conditions, instructions, query constraints, output contracts and registered Tool/MCP bindings within Agent versions.

#### Scenario: Save and revisit
- **WHEN** an administrator saves an edited node configuration
- **THEN** the candidate version preserves the complete workflow and the production configuration remains unchanged

#### Scenario: Reject invalid assembly
- **WHEN** a node contains duplicate identifiers, unregistered tools or a missing provider MCP
- **THEN** saving fails with an actionable error and existing versions are preserved

### Requirement: Frozen runtime workflow
The system SHALL use the published workflow for new consultations and retain its snapshot throughout follow-ups.

#### Scenario: Publish during a consultation
- **WHEN** a new configuration is published after a consultation starts
- **THEN** that consultation keeps its original workflow while new consultations receive the new configuration

#### Scenario: Database evidence gap
- **WHEN** the default workflow identifies a need for database evidence and the target and identifiers are known
- **THEN** it instructs the Agent to call authorized read-only database tools directly and incorporate results rather than ask the user to query

### Requirement: Effective capability assembly
The system SHALL assemble enabled nodes' capabilities under existing read-only and target-system boundaries in Claude and Codex.

#### Scenario: Disabled capability
- **WHEN** no enabled node binds a tool
- **THEN** configured workflow execution cannot invoke that tool through its MCP binding

#### Scenario: Configuration visibility
- **WHEN** administrators inspect the workflow
- **THEN** the UI distinguishes configured capabilities from runtime availability and does not present configuration steps as completed investigations
