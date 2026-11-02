## ADDED Requirements

### Requirement: Compact mobile session header
The mobile coding workspace SHALL retain a single header row with the current session identity, execution status and tools. Session navigation SHALL remain in the tools menu and session list.

#### Scenario: Tap the title
- **WHEN** the user clicks the selected session title
- **THEN** the existing inline rename editor opens without opening mode selection or the session list
- **AND** Enter or blur saves once to the captured session, Escape cancels, and IME composition confirmation does not save

#### Scenario: Hold the title
- **WHEN** the user holds the mobile title for 500 milliseconds without moving more than 8 pixels
- **THEN** the existing conversation modes open with their original permissions
- **AND** releasing does not start renaming and the popup contains no workspace-switch action

#### Scenario: Cancel the gesture
- **WHEN** the pointer moves, leaves or is cancelled, or the component unmounts before the hold threshold
- **THEN** no delayed mode popup appears and the cancelled gesture does not rename

#### Scenario: Keyboard operation
- **WHEN** the title receives Enter or Space
- **THEN** the rename action is activated
- **AND** Shift+F10 or the context-menu key opens mode selection, which restores title focus on dismissal

#### Scenario: Existing session tools
- **WHEN** the user opens session/sharing
- **THEN** the duplicate rename action is absent
- **AND** session selection remains available from the session list without losing the composer draft

#### Scenario: Rename result and session change
- **WHEN** saving fails or the selected session changes
- **THEN** the original optimistic rollback and recoverable error are retained for the captured session, and editing cannot write another session

#### Scenario: Desktop restoration
- **WHEN** the viewport becomes desktop width
- **THEN** the mobile mode popup closes and the original desktop views remain available with clickable title renaming
