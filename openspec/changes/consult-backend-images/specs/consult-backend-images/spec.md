## ADDED Requirements

### Requirement: Application-owned original images
The system SHALL accept bounded PNG/JPEG bytes using its application identity, return opaque attachment IDs and enforce client and tenant isolation, expiry and independent upload idempotency.

#### Scenario: Retry and different content
- **WHEN** an application repeats an uploadId with identical bytes and media type
- **THEN** the original ID is returned within the retention window, while changed bytes return a conflict and expired bytes are explicitly unavailable

#### Scenario: Foreign attachment
- **WHEN** a different application credential or enterprise references an attachment
- **THEN** access is rejected without revealing its metadata

### Requirement: Configurable and observable image storage
The system SHALL separate active byte/count budgets from bounded historical metadata retention, default to 256MiB per client and 1GiB globally, and retain existing request limits.

#### Scenario: Capacity boundary
- **WHEN** concurrent uploads exceed an active byte or image-count limit
- **THEN** the single-instance service admits only uploads within the budget and returns IMAGE_QUOTA_EXCEEDED with the specific dimension, current usage, limit and incoming amount

#### Scenario: Cleanup and diagnostics
- **WHEN** images expire or metadata exceeds its independent retention limit
- **THEN** cleanup releases expired bytes and prunes oldest metadata without deleting live content or task results; administrator diagnostics distinguish logical usage, cleanup status and physical storage metrics

### Requirement: Safe receipt reuse and bounded task retention
The system SHALL provide an application-scoped digest/media-type/lifetime lookup and atomically extend valid input retention with successful task admission, without indefinitely renewing old images.

#### Scenario: Reuse across tasks
- **WHEN** the same client queries an identical digest and media type with sufficient remaining lifetime
- **THEN** the original receipt is returned without allocating another image, while foreign, expired or mismatching content is not returned

#### Scenario: Task recovery window
- **WHEN** a task is admitted with valid images
- **THEN** bytes remain readable through the configured 48-hour admission/recovery window, bounded by a seven-day image lifetime; failed admission rolls back extensions and an identical requestId does not extend retention

### Requirement: Actual multimodal task input
The system SHALL pass original image bytes to the managed model runner and reject missing, expired, unreadable or unsupported images without publishing a complete successful analysis.

#### Scenario: Application-owned originals by reference
- **WHEN** the configured application submits opaque image references and the task starts
- **THEN** Forge reads the originals from the administrator-configured source, validates format, limits and digest, and persists references and results without storing original bytes in the attachment database

#### Scenario: Original image analysis
- **WHEN** an authorized request supplies live attachmentIds and a supported image model
- **THEN** the runner receives image content and the persisted task and result identify the actual inputs

### Requirement: Opt-in Forge reply candidates
The system SHALL preserve old text-only requests and CALLER output by default; replyMode FORGE SHALL produce exactly three validated, stable candidates alongside analysis and evidence, without sending messages or changing business data.

#### Scenario: Valid candidates and repeated reads
- **WHEN** a FORGE task completes with three valid candidates
- **THEN** repeated taskId/requestId queries return the same saved texts and IDs

#### Scenario: Invalid model output
- **WHEN** candidate count, evidence, text or image acknowledgements are invalid
- **THEN** the task fails explicitly without template candidates or fabricated success
