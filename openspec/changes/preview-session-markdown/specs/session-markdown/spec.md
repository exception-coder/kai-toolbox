## ADDED Requirements

### Requirement: Preview local Markdown links in the conversation

The system SHALL automatically render local `.md` and `.markdown` references inline in the conversation, with an optional expanded read-only dialog, without leaving Vibe Coding or launching a desktop program.

#### Scenario: Open and close a document

- **WHEN** a local Markdown reference approaches the visible conversation area in an available session
- **THEN** the complete authorized document is loaded and rendered below its associated paragraph or list without a click
- **AND** an optional expand action opens the existing reader with the same result
- **AND** source and fullscreen controls preserve the same file without another read
- **AND** closing restores the original message focus without scrolling

#### Scenario: Read another document from the preview

- **WHEN** the reader clicks a relative Markdown link within the document
- **THEN** the path is resolved against that document's directory and read using the existing session permissions
- **AND** the same dialog offers a return action without navigating the menu

#### Scenario: Preserve external links and existing file handling

- **WHEN** the link is a web URL or an unsupported local file link
- **THEN** its existing handling remains available and no automatic file fetch occurs

### Requirement: Bound and authorize Markdown reads

The system SHALL require authenticated session access, existing project path checks or a typed exact assistant Markdown reference, and complete UTF-8 content up to 2 MiB.

#### Scenario: Valid cross-directory assistant reference

- **WHEN** a standard development session's assistant has explicitly referenced the exact absolute Markdown file
- **THEN** the system may read that file after session and global exclusion checks without granting access to sibling files or registering the whole directory

#### Scenario: Rejected input or interrupted read

- **WHEN** content is missing, unauthorized, excluded, of another type, oversized, binary, invalid UTF-8 or truncated
- **THEN** the preview provides truthful feedback and retry or close actions instead of displaying partial results as complete
- **WHEN** the session changes or the final reader unmounts
- **THEN** pending reads are cancelled and late results cannot appear in the new session

#### Scenario: Empty content

- **WHEN** the complete file is empty
- **THEN** the preview explicitly reports an empty document rather than a loading or permission failure

### Requirement: Preview SQL files without execution

The system SHALL open authorized local `.sql` links in a lazy-loaded read-only SQL preview, using the same session/project and exact-reference boundaries as Markdown with a separate SQL reference type and 2 MiB UTF-8 limit.

#### Scenario: Read and copy SQL

- **WHEN** a local SQL reference approaches the visible conversation area, or a user opens a SQL link from a document preview
- **THEN** SQL syntax highlighting and line numbers are available without a database connection, script execution or system application launch
- **AND** copying preserves the original text; unavailable clipboard access offers manual selection
- **AND** no execute control is provided and no pending SQL registration or database state is changed

#### Scenario: Preserve authorization and recovery

- **WHEN** a user reads an unauthorized, excluded, wrong-type, oversized, invalid, binary or partial SQL file
- **THEN** the preview reports the failure and offers retry or close without expanding directory access
- **AND** SQL references cannot authorize sibling files, another session or another artifact type; user messages and readonly conversations cannot grant external references
- **WHEN** the final reader unmounts or the session changes
- **THEN** pending reads are cancelled, late results are ignored and focus returns to the original message

### Requirement: Automatically embed bounded local file previews

The system SHALL automatically render authorized local SQL, Markdown and Draw.io references next to their conversation context without requiring a click, using the existing typed read APIs and read-only renderers.

#### Scenario: Read a file in the message flow

- **WHEN** a supported local reference approaches the viewport
- **THEN** it automatically loads into a bounded inline reader with copy, refresh and optional expand actions
- **AND** repeated paths within the same text segment share one preview, append-only streaming preserves mounted readers and expanding reuses the loaded result
- **AND** Markdown document links do not recursively auto-embed other documents

#### Scenario: Preserve recovery and access boundaries

- **WHEN** an inline read fails or returns partial content
- **THEN** the reader shows truthful feedback and manual retry rather than treating partial content as complete
- **AND** no external URLs, code examples or forged data attributes initiate file reads
- **WHEN** the session changes
- **THEN** pending reads are cancelled and old content cannot appear in the new session
