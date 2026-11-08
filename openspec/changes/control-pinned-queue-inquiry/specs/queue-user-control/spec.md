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

Forge SHALL verify the selected message and native turn before interrupting active work. Unknown state, failed interrupt delivery or a different active turn SHALL preserve the item and report failure. Late success SHALL NOT release the cancelled queue.

#### Scenario: New turn owns the engine

- **WHEN** an old queue action encounters a different active turn
- **THEN** the new turn is not interrupted and the item is retained with an error

### Requirement: Explicit queue recovery

Forge SHALL require real idle admission before manual sending and SHALL restrict bulk deletion to the confirmed message IDs when provided.

#### Scenario: New message arrives during clearing

- **WHEN** a user clears the confirmed IDs and another message arrives
- **THEN** the new message is preserved and no message is automatically sent
