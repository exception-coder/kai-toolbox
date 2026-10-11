## ADDED Requirements

### Requirement: Read native follow-up predictions for a completed Codex turn
The system SHALL request native App Server predictions only after a successful official Codex development turn has released its writer, using the selected authorization directory, native thread ID and source turn ID.

#### Scenario: Native prediction arrives after acknowledgement
- **WHEN** App Server accepts the request and later reports a completed prediction for the requested thread and turn
- **THEN** Forge exposes its validated text to that idle session without adding a user turn or executing tools

#### Scenario: No usable prediction
- **WHEN** prediction fails, times out, returns null or malformed text, or the engine does not support predictions
- **THEN** normal messaging and the original completion outcome remain available without a fabricated suggestion or retry loop

#### Scenario: A subsequent turn starts
- **WHEN** a user or queue starts another turn on the same native thread
- **THEN** the prior prediction is cancelled and its process writer is released before the new turn starts

### Requirement: Accept a suggestion into the current draft
The interface SHALL show a native suggestion as light gray text only for an empty, idle composer in its matching session and source turn.

#### Scenario: Desktop acceptance
- **WHEN** the user presses unmodified Tab while a suggestion is visible and no completion menu or IME composition is active
- **THEN** the suggested text becomes an editable draft without sending or queueing it

#### Scenario: Mobile acceptance
- **WHEN** the user taps the suggestion acceptance action
- **THEN** the text becomes a draft and the message input regains focus

#### Scenario: Existing input or session change
- **WHEN** the user types, adds attachments, dismisses the suggestion or switches session, account, engine or source turn
- **THEN** stale suggestions are hidden and the user's existing draft and normal keyboard navigation are preserved
