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


### Requirement: Integrated mobile composer
The mobile composer SHALL default to one horizontal row containing more actions, text, voice and send, with an independent stop action while the Agent runs.

#### Scenario: Text and explicit expanded editing
- **WHEN** the user types multiple lines or selects expanded editing from more actions
- **THEN** the input SHALL grow within 30dvh and scroll internally beyond its limit
- **AND** expanded editing SHALL retain the same draft and textarea without dispatching messages
- **AND** empty input SHALL remain compact even when a follow-up suggestion is available.

#### Scenario: Existing action semantics
- **WHEN** the user uploads or pastes attachments, dictates, sends, queues or interrupts
- **THEN** the composer SHALL reuse existing session actions and attachment state
- **AND** recording SHALL occupy the input region without adding a persistent second toolbar
- **AND** mobile controls SHALL retain accessible names, native focus order and at least 44px touch targets.
