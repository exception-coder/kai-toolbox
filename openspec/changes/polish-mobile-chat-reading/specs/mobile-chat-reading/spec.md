## ADDED Requirements

### Requirement: Mobile content-first reading
The mobile Coding conversation SHALL render ordinary assistant text without an outer bubble while retaining structured code, file, tool and error containers.

#### Scenario: Reading preferences
- **WHEN** the user changes reading density or font size in workspace preferences
- **THEN** density SHALL control spacing independently of the saved font size, with standard density and 16px text as defaults
- **AND** the visible message and offset SHALL be restored without rebuilding the list or forcing a jump to the latest message
- **AND** rejected storage writes SHALL leave the previous preference unchanged and show an actionable error.

### Requirement: One mobile workflow entry
The mobile Coding session dock SHALL offer the existing authorized assistant launcher without maintaining a second assistant edge tab.

#### Scenario: Entering and leaving mobile Coding
- **WHEN** the authorized session dock is mounted on the mobile Coding route
- **THEN** the assistant host SHALL delegate its launcher to that dock
- **AND** opening it SHALL preserve the current Coding session and draft
- **AND** leaving the route or unmounting the dock SHALL restore the host launcher.
