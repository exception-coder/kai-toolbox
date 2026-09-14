## ADDED Requirements

### Requirement: Capsule voice conversation
The capsule SHALL provide explicit voice start, mute and stop controls using the current consultation and page context.

#### Scenario: Start and converse
- **WHEN** an authenticated user starts voice in an official Codex consultation
- **THEN** microphone capture starts following that action, and both roles' transcripts appear in the existing message viewport
- **AND** consultation read-only tools remain enforced

#### Scenario: Unsupported engine
- **WHEN** a non-supported engine or gateway attempts voice
- **THEN** a recoverable error is shown and text consultation remains usable

### Requirement: Voice resource isolation
The SDK SHALL scope voice events to the active call and release audio on stop, close, navigation, disconnect or destruction. Negotiation MUST NOT enter persistent message queues or diagnostics.

#### Scenario: Late permission or event
- **WHEN** microphone permission or a voice event arrives after the call was closed
- **THEN** no old audio resumes and a new call remains unaffected

#### Scenario: Explicit recovery
- **WHEN** a user reconnects after refreshing or another device takes over
- **THEN** recovery uses the existing session, old audio closes, and no task interrupt is sent
- **AND** a missing live voice thread returns an actionable error without terminating the running task
