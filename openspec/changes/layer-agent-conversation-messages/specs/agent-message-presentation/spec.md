## ADDED Requirements

### Requirement: Lightweight information blocks
The coding conversation SHALL distinguish assistant replies from the canvas with theme-aware content surfaces, weak boundaries and no shadow. Mobile body text SHALL use compact readable typography and each message SHALL retain its role and timestamp.

#### Scenario: Existing explicit sections
- **WHEN** a completed reply contains explicit change, verification or artifact sections
- **THEN** the original sections gain visual hierarchy without invented titles or success claims

#### Scenario: Streaming and shared references
- **WHEN** a reply is streaming or relies on shared Markdown reference definitions
- **THEN** the complete Markdown context remains available without broken links or omitted text

### Requirement: Reply actions on demand
The mobile workspace SHALL expose reply actions from one message-header more button while retaining the existing copy, fork and card capabilities.

#### Scenario: Copy a folded reply
- **WHEN** the user copies a reply with collapsed details
- **THEN** the complete original Markdown is copied and failure offers an in-place retry

#### Scenario: Restore keyboard focus
- **WHEN** the action menu closes with Escape or after a fork choice
- **THEN** focus returns to the original message action trigger when it remains available

#### Scenario: Desktop and other surfaces
- **WHEN** the user accesses the desktop coding workspace
- **THEN** actions remain reachable by hover or keyboard focus and wide touch devices keep them visible
- **AND** public reviews and other embedded message views retain their existing presentation
