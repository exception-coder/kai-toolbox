## MODIFIED Requirements

### Requirement: SQL registration presents a traceable review hierarchy

The session SQL workspace and management overlay SHALL present the registration identity, current status, target database, SQL content, and persisted lifecycle timestamps in a stable reading order without implying that Forge executes the SQL.

#### Scenario: Reviewing a pending registration
- **WHEN** a session has a pending SQL registration
- **THEN** the workspace shows the registration title and status before secondary evidence
- **AND** the persisted registration time is visible without a separate workflow visualization
- **AND** each execution database is visually clear before the SQL entries
- **AND** SQL content remains collapsed until its simple execution title is selected

#### Scenario: Managing on a narrow viewport
- **WHEN** the management overlay is opened on a narrow viewport
- **THEN** title, timeline, target selection, SQL editor, and primary save action remain reachable in logical order
- **AND** long target labels do not cause page-level horizontal overflow
