## ADDED Requirements

### Requirement: Readable progressive reply disclosure
The mobile coding workspace SHALL show full-width lightweight assistant content and SHALL offer original-text disclosure for long completed replies without inferring success or altering message storage.

#### Scenario: Read a long completed response
- **WHEN** a completed reply has a suitable short opening block and long remaining content
- **THEN** the opening is initially readable and a keyboard-accessible control reveals all remaining text, code and links
- **AND** copying and forking continue to use the original complete reply and anchor

#### Scenario: Observe the current running reply
- **WHEN** the current turn streams a reply
- **THEN** that reply stays fully visible while previous completed replies may remain folded
- **AND** desktop and short or unsuitable openings retain full content

### Requirement: Recoverable message images
Message images SHALL have loading and failure states with explicit retry, without exposing native broken image UI or expanding file access permissions.

#### Scenario: Failed image recovery
- **WHEN** an image fails to load
- **THEN** its name, a concise failure explanation and a retry action are available
- **AND** retry reads the same original source without sending an Agent message

#### Scenario: Replace the image source
- **WHEN** message content changes to a different image
- **THEN** previous image failure state is discarded and sanitized attributes remain enforced

### Requirement: Compact auxiliary controls
The mobile composer SHALL place idle dictation in additional actions while preserving active voice controls and one truthful execution summary.

#### Scenario: Start dictation and close additional actions
- **WHEN** a user explicitly starts dictation from additional actions
- **THEN** closing the menu does not unmount the voice controller and cancel or transcribe remains available

#### Scenario: Idle after an ended turn
- **WHEN** a historical ended turn is visible and the session is currently idle
- **THEN** the Dock provides a state entry without duplicating completion text
- **AND** current warnings, queue counts and running status remain discoverable
