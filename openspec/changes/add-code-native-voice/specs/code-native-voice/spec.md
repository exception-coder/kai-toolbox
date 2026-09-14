## ADDED Requirements

### Requirement: Explicit device takeover preserves the same voice thread
The system SHALL give audio ownership to the last valid explicit connection request received for the same live voice thread, without interrupting its code task or automatically reconnecting a displaced device.

#### Scenario: Phone takes over desktop audio
- **WHEN** a user explicitly connects from a phone while the same session has desktop audio
- **THEN** the desktop releases microphone and playback and displays that audio moved to another device
- **AND** the phone negotiates audio on the same native thread after the old transport closes
- **AND** this also works while the thread is listening without an active code turn

#### Scenario: Several devices request audio during negotiation
- **WHEN** a later valid request arrives before an earlier takeover completes
- **THEN** only the latest request retains audio ownership and negotiations are serialized
- **AND** stale device controls, close events and failed negotiations cannot close the latest owner
- **AND** negotiation failure remains visible without creating or interrupting a code task

### Requirement: Native voice belongs to the current Code session

The system SHALL offer native bidirectional voice for an official Codex Code session, retaining its project, native thread, authorization directory and execution policy.

#### Scenario: Start voice in an idle session
- **WHEN** the user starts voice in an eligible idle Code session and permits microphone access
- **THEN** the client SHALL negotiate native audio for that same thread, show connection progress and play incoming voice
- **AND** the text draft SHALL be preserved

#### Scenario: Start voice from a historical text-only thread
- **WHEN** an eligible persisted thread was created without realtime capability and Codex refuses to upgrade it in place
- **THEN** the system SHALL fork its complete history into a realtime-capable thread and keep it bound to the same Forge session
- **AND** the user SHALL continue in the same conversation view without manually creating a new session

#### Scenario: Unsupported or busy session
- **WHEN** voice is requested for a gateway, another engine, or a restricted session
- **THEN** the system SHALL refuse voice without starting a second writer or changing execution permissions
- **AND** the UI SHALL explain the recovery action

#### Scenario: Refresh and reconnect while code is running
- **WHEN** a voice session is refreshed or its browser connection is interrupted
- **THEN** the UI SHALL retain a per-tab, per-session recovery hint without claiming the old audio connection is still connected
- **AND** microphone capture SHALL require an explicit start or resume action
- **WHEN** the user requests resume while the original voice-triggered code task is still running
- **THEN** the system SHALL immediately negotiate a new audio connection on that same live native thread without creating, queuing or interrupting a code task
- **AND** the old audio transport SHALL finish closing before the new one starts; completion of the code task during reconnection SHALL not dispose the reconnecting thread
- **AND** stale owners and stale call controls SHALL not replace or stop the new connection
- **AND** missing live voice threads or failed negotiations SHALL return a voice-only error without changing the running code task
- **AND** explicitly ending a call SHALL clear its recovery hint; reloading SHALL not automatically activate the microphone

### Requirement: Voice supports continuous conversation and code execution

The system SHALL display live voice transcripts and retain native code events and approvals across multiple native turns within one call.

#### Scenario: Multiple spoken requests
- **WHEN** one native task completes while the call remains connected
- **THEN** the call SHALL remain available for the next spoken request on the same thread
- **AND** subsequent native turns SHALL have independent completion tracking

#### Scenario: Speech appears in the existing conversation
- **WHEN** user or assistant transcript fragments arrive for the active call
- **THEN** the existing message list SHALL render a user or assistant bubble in arrival order and update that same bubble until the utterance completes
- **AND** the final transcript SHALL replace partial text without duplication, and later utterances SHALL create new bubbles
- **AND** ending the call SHALL retain these bubbles in the current view; stale calls SHALL not insert messages
- **AND** native code output SHALL remain separate from spoken replies; the voice controls SHALL not render a second transcript panel

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
- **AND** a connection that never reached the started state SHALL NOT be presented as recoverable

#### Scenario: Stale or unauthorized control
- **WHEN** another connection or an old call attempts to stop or renew the active call
- **THEN** the command SHALL not change the active call

#### Scenario: Browser disappears
- **WHEN** the initiating connection closes or its heartbeat lease expires
- **THEN** the server SHALL stop realtime without automatically restarting recording

#### Scenario: Keyboard and narrow viewport
- **WHEN** the user operates the controls with keyboard or a mobile viewport
- **THEN** mute, end, retry and connection feedback SHALL remain accessible without horizontal overflow
