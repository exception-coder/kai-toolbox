## ADDED Requirements

### Requirement: Supported mobile Codex combinations
Official Codex sessions on mobile SHALL offer discrete model and reasoning combinations derived only from the current advertised catalog, alongside full custom configuration.

#### Scenario: Select a supported combination
- **WHEN** the user drags the range to a supported combination
- **THEN** the displayed model and effort preview changes without sending configuration during the drag
- **AND** release applies the selected combination once through existing next-turn settings without sending a chat message

#### Scenario: Cancel or change the configuration source
- **WHEN** the gesture is cancelled or the model, effort or catalog changes before confirmation
- **THEN** unconfirmed selection is discarded and no obsolete combination is applied

#### Scenario: Custom or unavailable catalog
- **WHEN** the current configuration does not match a quick combination or catalog support is absent
- **THEN** the actual custom state remains visible and full configuration is still reachable
- **AND** unavailable combinations are not fabricated

### Requirement: Preserve configuration context
The selection flow SHALL retain current session context, speed compatibility, draft and keyboard recovery while preserving existing desktop and non-official-Codex workflows.

#### Scenario: Open customization
- **WHEN** the user opens customization from quick selection
- **THEN** full model and effort controls appear within the same scrollable sheet
- **AND** closing returns focus to the original trigger without changing the draft

#### Scenario: Apply compatible speed
- **WHEN** the selected model explicitly does not support fast mode
- **THEN** existing model and effort settings use standard speed while unrelated settings stay unchanged

#### Scenario: Desktop and locked sessions
- **WHEN** the viewport is desktop or the session is locked
- **THEN** desktop retains full configuration and locked sessions cannot change settings

#### Scenario: Restore saved speed after refresh or reconnect
- **WHEN** a mobile or desktop client receives replayed Ready snapshots followed by the current session snapshot
- **THEN** model reasoning and speed are restored from the server without sending configuration mutations
- **AND** older standard-speed snapshots cannot overwrite the saved fast selection
- **AND** local cached options are used only for fields omitted by older servers; explicit user edits retain the existing persistence path
