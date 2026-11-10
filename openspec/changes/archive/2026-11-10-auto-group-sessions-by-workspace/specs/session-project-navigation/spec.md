## ADDED Requirements

### Requirement: Ungrouped sessions follow their primary working directory

The system SHALL keep explicitly assigned session groups and automatically project sessions without a manual group into groups identified by their complete primary working directory. Navigation SHALL NOT write inferred groups into persistence or the Project Registry.

#### Scenario: Existing sessions have no manual group
- **WHEN** sessions with the same primary working directory are loaded without a manual group
- **THEN** they appear together under the directory name
- **AND** entering that group shows only its member sessions with the existing status and specification filters
- **AND** no group write is issued by loading or entering the list

#### Scenario: Equivalent Windows directories are loaded
- **WHEN** drive-letter or UNC paths differ only in case, slash direction, redundant separators or trailing separators
- **THEN** their sessions share a directory group
- **AND** POSIX directory identity preserves case and root directories remain valid

#### Scenario: Directories have the same basename
- **WHEN** two primary directories have the same final directory name but different full paths
- **THEN** they remain independent groups with visible path context
- **AND** a manual group with that same name remains independent and keeps its existing rename action

#### Scenario: A manual group is cleared or the primary directory changes
- **WHEN** the refreshed session has no manual group
- **THEN** its directory group is recalculated from its current primary working directory
- **AND** attached directories do not change group membership
- **AND** global search labels reflect the same group

#### Scenario: No primary directory is recorded
- **WHEN** a session has neither a manual group nor a usable primary directory
- **THEN** it remains under the explicit ungrouped fallback
