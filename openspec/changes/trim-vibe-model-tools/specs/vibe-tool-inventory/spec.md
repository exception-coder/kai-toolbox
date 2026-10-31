## ADDED Requirements

### Requirement: Product-only model tool inventory
Vibe Coding SHALL expose only the six Forge product capabilities through its standard SDK and stdio MCP. Engineering methods SHALL follow project instructions and Team Standards without a second model-facing specification or execution workflow.

#### Scenario: Discover and call tools
- **WHEN** a standard development session discovers Forge MCP tools
- **THEN** it SHALL receive resource discovery/execution, SQL evidence/registration, page preview and progress reporting only
- **AND** calls to removed specification and execution tool names SHALL be refused
- **AND** restricted consultation SHALL retain its existing smaller inventory

### Requirement: Preserve adopted execution controls
Removing model registrations SHALL NOT erase or release existing execution state, disable gates, or expand resource, restart or execution authorization. Internal CLI/Hook contracts SHALL remain usable for adopted execution workflows.

#### Scenario: Recover a bound execution
- **WHEN** an existing writer requires a scope update or verification after the model tool removal
- **THEN** the internal CLI SHALL maintain the same execution identity and evidence rules
- **AND** an applicable native permission refusal SHALL identify the compatibility CLI without authorizing a bypass
