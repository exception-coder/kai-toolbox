## ADDED Requirements

### Requirement: Application-owned original images
The system SHALL accept bounded PNG/JPEG bytes using its application identity, return opaque attachment IDs and enforce client and tenant isolation, expiry and independent upload idempotency.

#### Scenario: Retry and different content
- **WHEN** an application repeats an uploadId with identical bytes and media type
- **THEN** the original ID is returned within the retention window, while changed bytes return a conflict and expired bytes are explicitly unavailable

#### Scenario: Foreign attachment
- **WHEN** a different application credential or enterprise references an attachment
- **THEN** access is rejected without revealing its metadata

### Requirement: Actual multimodal task input
The system SHALL pass original image bytes to the managed model runner and reject missing, expired, unreadable or unsupported images without publishing a complete successful analysis.

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
