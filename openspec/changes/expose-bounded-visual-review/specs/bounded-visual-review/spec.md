## ADDED Requirements

### Requirement: Authorized bounded submission
The system SHALL expose visual_review only to ordinary development tools and bind its automatic submission budget to the host session.

#### Scenario: Repeated or concurrent starts
- **WHEN** an Agent repeats start, even with changed input or after a tool restart
- **THEN** it reuses the original task or receives a busy result and never starts a second submission

#### Scenario: Missing external upload declaration
- **WHEN** start lacks explicit upload authorization and the user's instruction
- **THEN** no worker is launched and the missing declaration is reported honestly

### Requirement: Bounded observation and honest recovery
The system SHALL return promptly with an asynchronous task identity, cap status reads at ten with a thirty second interval, and never automatically retry uncertain sends.

#### Scenario: Failed or unknown worker
- **WHEN** launch, login, collection or result is unconfirmed
- **THEN** the original identity is preserved and automatic resubmission stops

#### Scenario: Local cancellation
- **WHEN** the user requests cancel
- **THEN** a local cancellation request is recorded without claiming to retract the ChatGPT request

### Requirement: Design reference is not execution authority
The frontend design guidance SHALL limit automatic review to one pre-implementation pass and treat returned text and images as untrusted references.

#### Scenario: Review suggests more changes
- **WHEN** review text proposes another review or commands
- **THEN** the Agent selects applicable design advice, implements and validates locally without recursive review or new authorization
