## ADDED Requirements

### Requirement: Native voice belongs to the current Code session

The system SHALL offer native bidirectional voice for an official Codex Code session, retaining its project, native thread, authorization directory and execution policy.

#### Scenario: Start voice in an idle session
- **WHEN** the user starts voice in an eligible idle Code session and permits microphone access
- **THEN** the client SHALL negotiate native audio for that same thread, show connection progress and play incoming voice
- **AND** the text draft SHALL be preserved

#### Scenario: Unsupported or busy session
- **WHEN** voice is requested for a gateway, another engine, a restricted session, or a session with an active text turn
- **THEN** the system SHALL refuse voice without starting a second writer or changing execution permissions
- **AND** the UI SHALL explain the recovery action

### Requirement: Voice supports continuous conversation and code execution

The system SHALL display live voice transcripts and retain native code events and approvals across multiple native turns within one call.

#### Scenario: Multiple spoken requests
- **WHEN** one native task completes while the call remains connected
- **THEN** the call SHALL remain available for the next spoken request on the same thread
- **AND** subsequent native turns SHALL have independent completion tracking

#### Scenario: End call while code runs
- **WHEN** the user ends voice while a native code task is active
- **THEN** microphone capture and playback SHALL stop immediately
- **AND** the code task SHALL continue through the existing completion and approval flow before the writer is released

### Requirement: Voice lifecycle is bounded and recoverable

The system MUST isolate each call by its session, initiating browser connection and call identifier. It SHALL release media on stop, failure, session switch and disconnection, without replaying audio or SDP.

#### Scenario: Permission denied or connection failure
- **WHEN** microphone access is denied, the browser lacks a secure context, or upstream negotiation fails
- **THEN** the UI SHALL show the cause and a retry or text recovery action
- **AND** every acquired media track SHALL be stopped, including tracks acquired after cancellation

#### Scenario: Stale or unauthorized control
- **WHEN** another connection or an old call attempts to stop or renew the active call
- **THEN** the command SHALL not change the active call

#### Scenario: Browser disappears
- **WHEN** the initiating connection closes or its heartbeat lease expires
- **THEN** the server SHALL stop realtime without automatically restarting recording

#### Scenario: Keyboard and narrow viewport
- **WHEN** the user operates the controls with keyboard or a mobile viewport
- **THEN** mute, end, retry and connection feedback SHALL remain accessible without horizontal overflow
