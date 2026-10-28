## ADDED Requirements

### Requirement: Bounded MCP startup failure feedback
The App Server adapter SHALL summarize MCP startup failures without serializing raw notification payloads and SHALL coalesce repeated failures for the same server and category within one turn until confirmed recovery.

#### Scenario: Remote challenge repeats
- **WHEN** one server emits failed startup statuses with different challenge request IDs in the same turn
- **THEN** only one concise challenge warning is emitted and it states that the tool is unavailable

#### Scenario: Recovery and another failure
- **WHEN** the same server reports ready and later fails again
- **THEN** a new warning is emitted

#### Scenario: Independent tools and permissions
- **WHEN** another MCP server fails or a required tool is unavailable
- **THEN** its own failure is preserved and existing required-tool validation remains unchanged
