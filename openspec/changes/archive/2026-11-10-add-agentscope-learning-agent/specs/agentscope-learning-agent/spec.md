# 教学 Agent

## ADDED Requirements

### Requirement: Shared runtime compatibility

The teaching agent SHALL coexist with the existing Spring AI MCP server in the assembled application without replacing its compatible SDK with an unused AgentScope MCP integration.

#### Scenario: Application startup and teaching execution

- **WHEN** the assembled application creates the MCP server and executes a scripted teaching scenario
- **THEN** server initialization and the local teaching tool loop both succeed on the same runtime classpath

### Requirement: Existing registry integration

The system SHALL show the teaching agent with six configuration sections inside existing Agent management, without a new menu.

#### Scenario: Select agent

- **WHEN** an administrator selects order-draft-teaching
- **THEN** the existing detail area displays teaching configuration and execution

### Requirement: Versioned configuration

The system SHALL save configuration atomically with a candidate version and reuse gateway credentials.

#### Scenario: Save and reload

- **WHEN** valid settings are saved and reloaded
- **THEN** the model, prompt and execution settings match the saved candidate

### Requirement: Validated drafts

The system SHALL validate model-proposed SKU and quantity through read-only Java tools.

#### Scenario: Ambiguity

- **WHEN** multiple mock SKUs match a style
- **THEN** clarification is required with no silent selection

#### Scenario: Update quantity

- **WHEN** quantity is changed on a previous draft
- **THEN** the known style is retained and the new quantity is validated

### Requirement: Honest bounded execution

The system SHALL distinguish fixed scripted demonstrations from real model runs and persist version-bound results with time, retry and concurrency limits.

#### Scenario: Demonstration

- **WHEN** a fixed scenario runs without credentials
- **THEN** real AgentScope dispatches scripted tool calls labelled as demonstration

#### Scenario: Failure

- **WHEN** the run fails or times out
- **THEN** a recoverable failure is recorded without a successful draft

### Requirement: Regression and release protection

The system SHALL compare actual fields against teaching expectations and SHALL reject production publishing of the teaching agent.

#### Scenario: Regression

- **WHEN** evaluation runs
- **THEN** per-case field differences and the configuration version are shown

#### Scenario: Spoofed score

- **WHEN** a caller supplies a passing score to publish
- **THEN** publishing is still rejected
