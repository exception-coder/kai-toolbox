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

#### Scenario: Prediction cleanup fails before consecutive messages
- **WHEN** prediction cleanup times out and another message is sent on the same thread
- **THEN** the system rechecks closure of the original process, keeps the message blocked while closure is unconfirmed, and reports the failure without repeating forced termination
- **AND** after closure is confirmed, the failed prediction barrier is removed and subsequent consecutive messages can start normally
- **AND** concurrent closure checks share one wait and unrelated errors are not swallowed

#### Scenario: A prediction is replaced during cancellation
- **WHEN** cancellation is waiting for a prior prediction and another prediction replaces it
- **THEN** cancellation also releases or prevents the replacement before permitting a subsequent main turn

### Requirement: Confirm App Server process release across client operations
The Sidecar SHALL observe native close from process creation and drain remaining stdout and stderr after protocol handling ends for main turns, predictions and one-shot queries.

#### Scenario: Exit precedes output closure
- **WHEN** a wrapper exits while buffered output or inherited child pipes remain open
- **THEN** exit code alone does not release its writer, and pending protocol output receives a bounded drain window
- **AND** close observed before a later wait remains valid evidence of release

#### Scenario: Main turn cleanup fails before subsequent sends
- **WHEN** a main turn cannot confirm process closure after its bounded cleanup attempt
- **THEN** the failure remains visible and subsequent sends through the same session or native-thread identity are blocked before spawning another process
- **AND** original process closure releases the barrier for future sends without automatically replaying an accepted turn

#### Scenario: One-shot query cleanup fails
- **WHEN** a one-shot capability query receives a result or RPC error but cannot confirm process closure
- **THEN** the operation reports cleanup failure with any original RPC error retained instead of returning a successful result

### Requirement: Observe silent main turns without inferring failure
The Sidecar SHALL treat absence of model activity as diagnostic information, not as proof of failure or completion. Silence monitoring SHALL NOT interrupt or replay a main turn, change its phase to failed or stalled, or generate a warning message solely because an interval elapsed.

#### Scenario: A task remains silent for more than two hours
- **WHEN** a main turn has no new model activity for more than two hours and no authoritative terminal or failure is received
- **THEN** response monitoring records at most one diagnostic per silent interval and keeps the turn awaiting the engine
- **AND** a local heartbeat does not count as genuine progress, and real activity allows a new diagnostic interval

#### Scenario: Real failure or cancellation
- **WHEN** the engine reports a terminal error, its process crashes, explicit connection recovery fails, or the user cancels
- **THEN** existing failure, cancellation and cleanup handling remains effective
- **AND** independent tool execution deadlines remain applicable

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
