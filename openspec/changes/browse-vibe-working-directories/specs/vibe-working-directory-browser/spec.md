## ADDED Requirements

### Requirement: Select an existing working directory in Vibe Coding
New-session UI SHALL provide in-place host drive and directory browsing and SHALL only update cwd after explicit confirmation through the existing preference flow.

#### Scenario: Select another disk
- **WHEN** the user changes the drive and enters a child directory
- **THEN** the browser shows that directory and can return to its parent without changing cwd until confirmation

#### Scenario: Confirm or cancel
- **WHEN** the user confirms an accessible directory or closes browsing
- **THEN** confirmation remembers cwd, cancellation preserves the original cwd, other new-session fields remain intact, and focus returns to the browse trigger

#### Scenario: Pending and failed browsing
- **WHEN** directory loading is pending or fails
- **THEN** confirmation is disabled and error recovery allows retry, another drive or manual input after closing

### Requirement: Read-only bounded directory access
The directory browser SHALL preserve global project exclusions, SHALL validate both normalized and real paths, and SHALL not register projects or modify filesystem contents.

#### Scenario: Excluded location or link
- **WHEN** a requested directory or its real target is globally excluded
- **THEN** the request is rejected and the excluded directory is omitted from children

#### Scenario: Wide directory
- **WHEN** more than 500 accessible children are found
- **THEN** at most 500 are returned with a truncation notice and a manual-path recovery
