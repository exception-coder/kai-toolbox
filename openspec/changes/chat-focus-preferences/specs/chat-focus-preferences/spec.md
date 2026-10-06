## ADDED Requirements

### Requirement: Reversible conversation focus mode
The workspace SHALL offer one-action focus mode that fills the screen with conversation and input, retaining an accessible exit action and permission dialogs.

#### Scenario: Enter and exit focus
- **WHEN** the developer enters focus and exits with the exit control or Escape
- **THEN** the original view and panel SHALL be restored without resetting the current draft or session

#### Scenario: Native fullscreen is unavailable
- **WHEN** the browser refuses or does not implement native fullscreen
- **THEN** a viewport-filling focus view SHALL remain usable with the same exit action
- **AND** hidden background navigation SHALL not receive keyboard focus

### Requirement: Persistent personal recent-session defaults
The workspace SHALL allow developers to choose an expanded or collapsed recent-session default in the current browser, without changing project configuration.

#### Scenario: Preference is saved
- **WHEN** the developer changes the default
- **THEN** mounted recent-session sections SHALL apply the preference and a later page load SHALL reuse it
- **AND** a temporary title toggle SHALL NOT overwrite the saved default

#### Scenario: Storage refuses a write
- **WHEN** local storage refuses the preference change
- **THEN** the UI SHALL preserve the previous setting and explain how to retry
