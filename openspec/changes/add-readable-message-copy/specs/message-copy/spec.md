## ADDED Requirements

### Requirement: Copy complete answers in readable, rich and original formats
The system SHALL offer readable text, rich text and unchanged Markdown for complete AI answers and complete turns. Readable text SHALL preserve outline levels, list order, task state, table values, link destinations and literal code without summarizing or sending the content to another service.

#### Scenario: Copy for a business chat
- **WHEN** the user clicks an AI answer's default copy action
- **THEN** the clipboard receives readable text suitable for pasting into chat, including the complete folded answer and its outline

#### Scenario: Rich text is unavailable
- **WHEN** rich clipboard writing is unavailable or rejected but plain text copying succeeds
- **THEN** the system copies the readable alternative and explicitly reports the downgrade instead of claiming rich text success

#### Scenario: Preserve the source
- **WHEN** the user chooses Markdown original, or uses the default action on their own message
- **THEN** the system copies the unchanged source; a failed operation remains retryable without changing the chosen format
