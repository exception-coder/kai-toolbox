## ADDED Requirements

### Requirement: Running message destination is explicit
Forge SHALL expose a distinct queue action during an active Code Agent turn. When the active engine is official Codex, Forge SHALL also expose a distinct action to supplement the current turn for text-only input. The default desktop Enter action SHALL queue the message.

#### Scenario: Official Codex text while running
- **WHEN** the user enters text in a running official Codex session
- **THEN** the composer offers both “补充到当前轮” and “加入队列”; each sends to its named destination

#### Scenario: Attachment or unsupported engine
- **WHEN** the input includes an attachment or the running engine does not support steer
- **THEN** only the queue action is available and the message is not steered

#### Scenario: Default keyboard action
- **WHEN** the user presses Enter on a desktop keyboard during an active turn
- **THEN** the message enters the queue; Shift+Enter inserts a newline

#### Scenario: Mobile composer
- **WHEN** the user uses a narrow touch viewport
- **THEN** available actions retain readable labels and usable touch targets without horizontal overflow, and Enter inserts a newline

#### Scenario: Empty or locked input
- **WHEN** the input is empty or the session plan is locked
- **THEN** neither running-message action sends a message
