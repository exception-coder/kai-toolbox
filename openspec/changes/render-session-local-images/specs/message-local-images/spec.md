## ADDED Requirements

### Requirement: Display project images in session replies
Authenticated users SHALL be able to view local image evidence in Markdown through the current session's existing project access boundary.

#### Scenario: Restore an absolute or relative disk image
- **WHEN** a reply contains a Windows drive, file URI, POSIX directory path or relative project image
- **THEN** the client SHALL preserve the path through HTML sanitization and load it with session authentication
- **AND** it SHALL display the returned image bytes without asking the browser to load a filesystem URL

#### Scenario: Reject an inaccessible or invalid image
- **WHEN** the user lacks session access, the path is outside allowed projects, the file is missing, is not a supported image or exceeds 25 MiB
- **THEN** the server SHALL reject the request before returning file content
- **AND** the client SHALL show a recoverable error without invoking the Agent

#### Scenario: Retry or leave the message
- **WHEN** a user retries, changes sessions or replaces the message
- **THEN** retries SHALL read the source again, old requests SHALL be cancelled, late results SHALL NOT appear in the new session, and object URLs SHALL be released

#### Scenario: Preserve existing web images and HTML protection
- **WHEN** Markdown contains HTTP, supported data/blob or existing site image routes, or executable image attributes
- **THEN** existing web image behavior and HTML sanitization SHALL remain in force
