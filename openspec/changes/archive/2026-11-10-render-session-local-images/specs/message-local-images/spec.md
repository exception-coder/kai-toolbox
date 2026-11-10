## ADDED Requirements

### Requirement: Display project images in session replies
Authenticated users SHALL be able to view local image evidence in Markdown through the current session's existing project access boundary.

#### Scenario: Restore an absolute or relative disk image
- **WHEN** a reply contains a Windows drive, file URI, POSIX directory path or relative project image
- **THEN** the client SHALL preserve the path through HTML sanitization and load it with session authentication
- **AND** it SHALL display the returned image bytes without asking the browser to load a filesystem URL

#### Scenario: Reject an inaccessible or invalid image
- **WHEN** the user lacks session access, the path is outside allowed projects without a verified assistant image reference in this development session, the file is missing, is not a supported image or exceeds 25 MiB
- **THEN** the server SHALL reject the request before returning file content
- **AND** the client SHALL show a recoverable error without invoking the Agent

#### Scenario: Retry or leave the message
- **WHEN** a user retries, changes sessions or replaces the message
- **THEN** retries SHALL read the source again, old requests SHALL be cancelled, late results SHALL NOT appear in the new session, and object URLs SHALL be released

#### Scenario: Preserve existing web images and HTML protection
- **WHEN** Markdown contains HTTP, supported data/blob or existing site image routes, or executable image attributes
- **THEN** existing web image behavior and HTML sanitization SHALL remain in force

### Requirement: Referenced cross-directory image evidence
Authenticated standard development sessions SHALL allow an exact absolute raster image path already referenced by that session's assistant Markdown, even when its primary project directory differs. This SHALL NOT grant directory access or permit excluded paths, other sessions' references, user text or plain links.

#### Scenario: Historical screenshot produced outside the main project
- **WHEN** an authorized history page contains an assistant image reference outside the session project
- **THEN** only that exact image can be read after normal image content checks

#### Scenario: Cold reference cache
- **WHEN** the image path is outside the project and not in the bounded reference cache
- **THEN** the server checks only the existing native handles' latest bounded history page; older pages are verified when normally loaded, without a full transcript scan
