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

### Requirement: Persist explicit working directory shortcuts
The new-session panel SHALL save explicitly selected directory shortcuts through the existing server preference storage, register the same path through the authoritative project workspace configuration, and offer it after reload or from another device using the same Forge instance.

#### Scenario: Save and restore
- **WHEN** a user saves a valid directory and later reopens the panel
- **THEN** the path is read from server preferences and can be selected without browsing again
- **AND** saving or selecting refreshes the authoritative workspace list and selects that root so its projects can be chosen without losing the new-session draft

#### Scenario: An old shortcut has no workspace registration
- **WHEN** a user saves or selects a shortcut created before workspace registration was supported
- **THEN** the system adds its validated path to the existing workspace configuration without duplicating normalized paths or removing previous roots

#### Scenario: Registration or shortcut persistence fails
- **WHEN** registration fails or shortcut persistence fails after registration succeeded
- **THEN** the interface reports failure or partial success accurately without claiming both stores were saved, retains recoverable data, and allows retry

#### Scenario: Duplicate and failed save
- **WHEN** the directory already exists in the shortcut list or the latest preference cannot be read
- **THEN** duplicate path variants are not appended and failed reads do not overwrite stored data

#### Scenario: Select an unavailable directory
- **WHEN** a saved directory no longer exists or is excluded
- **THEN** selection is rejected without changing cwd and removal remains available

#### Scenario: Remove a shortcut
- **WHEN** the user removes a saved directory
- **THEN** only the server shortcut list changes, registered workspace roots remain managed by project directory settings, and filesystem files remain untouched
