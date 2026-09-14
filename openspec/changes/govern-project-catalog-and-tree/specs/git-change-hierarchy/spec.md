## ADDED Requirements

### Requirement: Hierarchical Git changes
Git changes SHALL present directory hierarchy, collapsible groups, compact single-directory chains, entry counts and file statuses.

#### Scenario: Browse and refresh
- **WHEN** users collapse a directory and refresh the Git workspace
- **THEN** the directory remains collapsed and current file statuses remain available when expanded

#### Scenario: Rename and untracked directory
- **WHEN** changes include renamed files and untracked directory entries
- **THEN** the original rename path is retained and counts describe entries rather than inventing recursive file totals

#### Scenario: Keyboard and small viewport
- **WHEN** users browse with keyboard or a narrow viewport
- **THEN** directory controls remain operable and file names and statuses remain readable
