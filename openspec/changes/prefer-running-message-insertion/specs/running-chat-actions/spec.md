## MODIFIED Requirements

### Requirement: Running message destination is explicit
Forge SHALL expose distinct insertion and queue actions during an active official Codex text-only turn. Desktop Enter and the main desktop running-send button SHALL prefer insertion when eligible; otherwise they SHALL queue. Ctrl/Cmd+Enter SHALL explicitly queue.

#### Scenario: Eligible desktop text
- **WHEN** the user presses Enter or clicks the main running-send button with text in a running official Codex session
- **THEN** the text is inserted through steer, and is not appended to the queue

#### Scenario: Explicit queue
- **WHEN** the user presses Ctrl/Cmd+Enter or selects 加入队列
- **THEN** the text enters the persistent queue and is not steered

#### Scenario: Unsupported insertion
- **WHEN** the input has attachments or the engine/provider cannot steer
- **THEN** Enter and the main button queue the message, and no insertion action is offered

#### Scenario: Newline and input method
- **WHEN** the user presses Shift+Enter, confirms composition, or presses Enter on a touch device
- **THEN** no message is sent by the key event

#### Scenario: Empty or locked input
- **WHEN** the input is empty, uploading, or the plan is locked
- **THEN** neither running-message action sends a message

#### Scenario: Existing queued records
- **WHEN** the default composer behavior changes
- **THEN** existing queued messages retain their original order and dispatch behavior
