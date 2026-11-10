## ADDED Requirements

### Requirement: Current Codex message records remain recoverable
The service SHALL read response-item user and assistant text as well as legacy message events, without exposing startup context or analysis messages or duplicating paired representations.

#### Scenario: Capsule restores a response-item transcript
- **WHEN** a page session reloads a transcript containing response-item messages after its turn context
- **THEN** its existing user and assistant messages are returned and remain available to feedback archival

#### Scenario: Both message formats describe the same turn
- **WHEN** matching legacy events and response-item messages appear in a turn
- **THEN** each matched message is displayed once

### Requirement: Large history is paged without repeated whole transcript materialization
The service SHALL preserve the existing history page contract while avoiding repeated full transcript parsing and retention of off-page tool bodies.

#### Scenario: Large existing session is opened repeatedly
- **WHEN** a user opens the measured approximately 1 GiB Codex session and requests older pages
- **THEN** the cold page completes within the existing 20 second deadline on the validation host and subsequent pages read their indexed body ranges without rescanning the whole transcript

### Requirement: History and usage share incremental state
The service SHALL reuse indexed state for history and usage, preserving message order, IDs, turn statistics and tool result pairing.

#### Scenario: A running session appends output and another turn
- **WHEN** tool output or a new user turn is appended after a page has been read
- **THEN** subsequent pages contain the appended data with correct tool pairing and exactly one result per completed token-bearing turn, and usage does not double count prior data

#### Scenario: History and usage load concurrently
- **WHEN** both endpoints request the same transcript concurrently
- **THEN** they share a serialized index update and return consistent complete snapshots

### Requirement: File and review boundaries remain safe
The service SHALL isolate indexes by transcript location and review boundary and recover from interrupted or replaced files without altering the original transcript.

#### Scenario: Partial tail and malformed completed line
- **WHEN** the log contains a malformed completed line followed by valid data or ends with an unfinished JSON record
- **THEN** completed valid records remain visible and the unfinished record becomes visible exactly once after completion

#### Scenario: File replacement or truncation
- **WHEN** a cached file is replaced, truncated or modified without growth
- **THEN** the next read rebuilds state and does not serve stale messages or stale usage

#### Scenario: File changes during page materialization
- **WHEN** the indexed file is rewritten during a read or its body cannot be read
- **THEN** the request fails observably instead of returning an empty successful history page and a subsequent retry rebuilds the invalidated index

#### Scenario: Review of a fork
- **WHEN** a review loads a fork with inherited development events
- **THEN** only events after its first matching working directory context are visible and normal history cache data cannot leak across that boundary
