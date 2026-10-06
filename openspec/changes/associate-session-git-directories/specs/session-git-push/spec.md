## ADDED Requirements

### Requirement: Select linked session repositories
The session commit history SHALL list primary and explicitly linked Git repositories and offer directory association management using the existing session project directory relation.

#### Scenario: Select linked repository
- **WHEN** the user selects an associated project
- **THEN** commits, diffs and push previews refer to that repository without changing primary cwd

#### Scenario: Association removed or excluded
- **WHEN** an old repository selection is no longer associated or is excluded
- **THEN** the server refuses it before any Git operation

#### Scenario: Manage associations
- **WHEN** the user saves directory associations and returns to commit history
- **THEN** the repository list refreshes and query errors offer retry without losing session context
