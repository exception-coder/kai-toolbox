## ADDED Requirements

### Requirement: Single site navigation entry

The conversation SHALL expose linked sites through the existing Sites tab without a duplicate header pill.

#### Scenario: Manage linked sites

- **WHEN** a user opens the Sites tab for a session
- **THEN** the existing site workspace provides opening, copying and managing sites, including an empty-state recovery action

### Requirement: Header respects available space

The header SHALL separate the title, runtime state and actions without overlapping and adapt secondary information to its container width.

#### Scenario: Constrained desktop header

- **WHEN** the header container becomes narrower
- **THEN** secondary usage and transport information and action text are progressively hidden while essential actions retain accessible names

#### Scenario: Long session title

- **WHEN** a session title exceeds its available width
- **THEN** it truncates without displacing or overlapping runtime state and controls
