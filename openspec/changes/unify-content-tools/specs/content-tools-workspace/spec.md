## ADDED Requirements

### Requirement: Unified content tools

The system SHALL provide one 内容工具 menu with five tool views, preserving existing operations and inputs across tool switches.

#### Scenario: Switch tools
- **WHEN** a user enters text in 格式化工具, switches to another tool and returns
- **THEN** the prior input remains and only the selected tool is visible

#### Scenario: Hidden paste listener
- **WHEN** the QR reader has been opened but another tool is selected
- **THEN** the hidden QR reader does not intercept clipboard events

### Requirement: Compatible links and access

The system SHALL redirect legacy tool links while preserving unrelated query parameters and fragments, and SHALL expose only authorized tools.

#### Scenario: Legacy link
- **WHEN** a user opens /tools/formatter?sample=one#input
- **THEN** the content tools workspace opens the formatter with sample and fragment preserved

#### Scenario: Restricted access
- **WHEN** a user has only menu:formatter
- **THEN** the unified entry and formatter are available and other tools are not mounted

#### Scenario: Full workspace access
- **WHEN** a user has menu:content-tools
- **THEN** all five tools are available

#### Scenario: Keyboard and invalid selection
- **WHEN** a user opens an unknown tool parameter or uses the keyboard to switch views
- **THEN** available views remain reachable through focusable navigation and invalid selection is explained

### Requirement: Retired module registration

The system SHALL remove resume and workline from the active frontend registry without deleting stored data.

#### Scenario: Retired entries
- **WHEN** menus, preferences or routes are resolved
- **THEN** personal resume and workline are absent from the registered features
