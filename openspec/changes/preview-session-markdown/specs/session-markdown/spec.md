## ADDED Requirements

### Requirement: Preview local Markdown links in the conversation

The system SHALL open local `.md` and `.markdown` links in a read-only dialog without leaving Vibe Coding or launching a desktop program.

#### Scenario: Open and close a document

- **WHEN** a user clicks a local Markdown link in an available session
- **THEN** the complete authorized document is loaded on demand and rendered in place
- **AND** source and fullscreen controls preserve the same file without another read
- **AND** closing restores the original message focus without scrolling

#### Scenario: Read another document from the preview

- **WHEN** the reader clicks a relative Markdown link within the document
- **THEN** the path is resolved against that document's directory and read using the existing session permissions
- **AND** the same dialog offers a return action without navigating the menu

#### Scenario: Preserve external links and existing file handling

- **WHEN** the link is a web URL or an existing Draw.io or non-Markdown file link
- **THEN** its existing handling remains available

### Requirement: Bound and authorize Markdown reads

The system SHALL require authenticated session access, existing project path checks or a typed exact assistant Markdown reference, and complete UTF-8 content up to 2 MiB.

#### Scenario: Valid cross-directory assistant reference

- **WHEN** a standard development session's assistant has explicitly referenced the exact absolute Markdown file
- **THEN** the system may read that file after session and global exclusion checks without granting access to sibling files or registering the whole directory

#### Scenario: Rejected input or interrupted read

- **WHEN** content is missing, unauthorized, excluded, of another type, oversized, binary, invalid UTF-8 or truncated
- **THEN** the preview provides truthful feedback and retry or close actions instead of displaying partial results as complete
- **WHEN** the session changes or preview closes
- **THEN** pending reads are cancelled and late results cannot appear in the new session

#### Scenario: Empty content

- **WHEN** the complete file is empty
- **THEN** the preview explicitly reports an empty document rather than a loading or permission failure
