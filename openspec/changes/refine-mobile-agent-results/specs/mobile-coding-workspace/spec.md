## ADDED Requirements

### Requirement: Result-first mobile conversation
The mobile coding workspace SHALL prioritize original result, change and verification text while keeping full reply and execution evidence available on demand. It SHALL NOT fabricate verification or success from presentation rules.

#### Scenario: Verification follows file details
- **WHEN** a completed reply contains an introduction, file details and an explicit verification section
- **THEN** the overview retains the original verification text and applicable risk or pending-confirmation sections, while file details remain expandable

#### Scenario: Current execution is consolidated
- **WHEN** the mobile main workspace has an execution dock and tool details are hidden
- **THEN** technical events remain available in the dock, formal conversation errors remain visible, and only the latest completed round's status is moved out of the message flow

#### Scenario: Copy current round
- **WHEN** the user opens current completed round details and copies the round
- **THEN** all assistant text in that round is copied in original order and file changes remain accessible

#### Scenario: Advanced composer actions
- **WHEN** the mobile user opens the plus menu and enters model configuration
- **THEN** the same quick combinations and custom settings remain available after the menu closes, the draft is retained, and closing configuration returns focus to the plus control

#### Scenario: Other consumers
- **WHEN** a desktop or embedded consumer has no explicit dock presentation
- **THEN** its existing configuration and message-detail entries remain available
