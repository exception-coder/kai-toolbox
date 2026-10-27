## ADDED Requirements

### Requirement: One server-owned consultation account policy
The server SHALL validate and version the existing administrator-owned default account before saving, audit changes without credentials, and resolve that policy immediately before every consultation turn executes. Ordinary users SHALL NOT modify it. Other tools SHALL remain unaffected.

#### Scenario: A stale browser follows up after an account change
- **WHEN** the administrator changes account A to validated B and an existing consultation sends another question without refreshing
- **THEN** its next execution uses B and the current policy version, while an already running A turn finishes with A

### Requirement: Durable and authorized context continuation
The platform SHALL preserve consultation identity, ownership, saved history and file authorization independently of AI login. A new account SHALL use a new native thread and authorized persisted context, with paged access to long raw evidence and explicit gaps.

#### Scenario: Switching back to a previous account
- **WHEN** a consultation switches A to B and later back to A
- **THEN** A receives the intervening persisted context without restoring an outdated native thread or losing the B segment

### Requirement: Recoverable and idempotent admission
The platform SHALL serialize account handoff and persist request identity and execution state. It SHALL NOT replay an ambiguously sent question, silently fall back to an old account, or allow an archived or unauthorized consultation to execute.

#### Scenario: Account validation or context preparation fails
- **WHEN** B is unavailable or context cannot be prepared
- **THEN** the original binding, history and draft remain recoverable and the failure is explicit
