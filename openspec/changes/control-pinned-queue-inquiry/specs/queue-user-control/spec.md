## Purpose

让会话使用者在现有队列入口终止询问、删除消息并明确决定何时继续。

## ADDED Requirements

### Requirement: User controls pinned inquiry

Forge SHALL offer stop and delete actions for the pinned executing or blocked queue item within the existing session access boundary. Other pending messages SHALL remain paused after cancellation, without marking the task completed.

#### Scenario: Cancel a blocked inquiry

- **WHEN** the session user stops or deletes a blocked head
- **THEN** automatic completion checks stop durably, including after recovery
- **AND** deleting removes the selected item while preserving other pending messages

### Requirement: Cancellation targets the original turn

Forge SHALL persist automation withdrawal before querying native state and verify the selected native turn before interrupting active work. Unknown state, failed interrupt delivery or a different active turn SHALL preserve native runtime evidence and report termination as unconfirmed, without restoring automated checks. Late success SHALL NOT release the cancelled queue.

#### Scenario: New turn owns the engine

- **WHEN** an old queue action encounters a different active turn
- **THEN** the new turn is not interrupted, withdrawal stays persisted and native termination is reported as unconfirmed

### Requirement: Pause and deletion survive stale requests
Forge SHALL persist explicit user pause without terminating the native turn, project paused or cancelled queue tasks without resetting them to waiting, and prevent a deleted message ID from being restored by stale requests or list responses.

#### Scenario: Completion arrives while paused
- **WHEN** a native completion or acceptance arrives after pausing
- **THEN** the original native outcome remains observable but automated dispatch and completion checks remain paused until explicit user confirmation and idle admission

#### Scenario: A stale client registers a deleted message
- **WHEN** a previously deleted message ID is submitted again or appears in a late list response
- **THEN** it is not restored to the queue or current client list and its linked task is not reset to waiting

### Requirement: Explicit queue recovery

Forge SHALL require real idle admission before manual sending and SHALL restrict bulk deletion to the confirmed message IDs when provided.

#### Scenario: New message arrives during clearing

- **WHEN** a user clears the confirmed IDs and another message arrives
- **THEN** the new message is preserved and no message is automatically sent
