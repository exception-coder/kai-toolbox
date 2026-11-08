## ADDED Requirements

### Requirement: Private hosting profiles
The system SHALL allow an authenticated content-tools user to maintain their own OSS, GitHub and S3-compatible profiles, choose a default and preserve encrypted credentials without returning plaintext credentials.

#### Scenario: Edit and isolate
- **WHEN** a user edits a saved profile without supplying a new secret
- **THEN** the existing secret is preserved and another user cannot read, use or delete the profile

#### Scenario: Lost save response
- **WHEN** the same creation request is submitted again after an uncertain response
- **THEN** the same owner-bound profile identity is reused rather than creating duplicate profiles, and browser persistence contains only the request ID and no credentials

### Requirement: Explicit image upload
The system SHALL upload supported bounded images only after an explicit user action and return an HTTPS image URL and escaped Markdown without changing remote access permissions.

#### Scenario: Repeat or uncertain upload
- **WHEN** an identical request ID is repeated
- **THEN** a successful receipt is reused, changed content is rejected and an in-progress or uncertain upload is not automatically repeated

#### Scenario: Invalid image or endpoint
- **WHEN** image signatures, size, directory settings or endpoint restrictions are invalid
- **THEN** the system rejects before sending credentials or image content upstream

### Requirement: Writing workflow
The system SHALL expose image-host settings and paste/drop/file upload in content tools, preserve user input on errors and provide Markdown and URL copy actions.

#### Scenario: Save then upload
- **WHEN** the user saves a profile
- **THEN** no remote image is uploaded until the user explicitly uploads an image
