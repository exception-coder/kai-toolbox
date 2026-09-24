## ADDED Requirements

### Requirement: Gateway provider profiles are server-owned

Forge SHALL store third-party gateway profiles in its local SQLite database, present the same redacted profile list to connected browsers, and resolve API Keys on the server when opening or switching a Claude Code or Codex session by profile ID. Profile list and edit responses MUST NOT disclose saved API Keys; leaving the Key field blank while editing SHALL preserve the existing Key.

#### Scenario: Open or switch to a saved profile

- **WHEN** a user opens a compatible agent session or switches its provider using a saved profile ID
- **THEN** Forge resolves the saved address and Key on the server and preserves existing session-level routing and resume behavior

#### Scenario: Profile is missing

- **WHEN** a client references a deleted or unknown profile ID
- **THEN** Forge rejects the request explicitly without silently using official login or another gateway

#### Scenario: Legacy browser profiles migrate

- **WHEN** a browser with legacy localStorage profiles loads the provider list
- **THEN** Forge imports records idempotently by stable profile ID without overwriting server-edited records and removes the browser copy only after successful confirmation
- **AND** a failed import retains the browser copy and offers retry

#### Scenario: Manage a saved profile

- **WHEN** a user creates, edits, or deletes a profile
- **THEN** subsequent profile lists across connected browsers reflect the server state, while sessions already created from that profile retain their existing session snapshot
