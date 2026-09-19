## ADDED Requirements

### Requirement: Antigravity replies converge to an authoritative complete snapshot

Forge SHALL preserve Antigravity streaming output during a turn and SHALL converge the visible assistant reply to the UTF-8 transcript response for the same conversation when the turn completes.

#### Scenario: Corrupted live output is repaired
- **WHEN** Antigravity live output contains replacement characters or otherwise differs from the completed transcript response
- **THEN** Forge replaces the current turn assistant draft with the complete transcript response before presenting the turn as settled

#### Scenario: Correct live output remains streaming
- **WHEN** Antigravity live output is valid and equals the completed transcript response
- **THEN** Forge keeps the streamed reply and does not emit a redundant replacement

### Requirement: Integrity repair is client independent

Forge MUST express Antigravity terminal correction through the unified ordered session event contract rather than through browser-specific encoding behavior.

#### Scenario: Multiple client types observe the same correction
- **WHEN** a corrected Antigravity turn is delivered through the Forge session WebSocket
- **THEN** every compatible client receives the same ordered full-text snapshot and can deterministically replace the current assistant draft

### Requirement: Missing authoritative evidence fails visibly

Forge MUST NOT invent replacement text when the matching transcript is unavailable, stale, malformed, or belongs to another conversation.

#### Scenario: Transcript cannot be used
- **WHEN** damaged live text is detected but no current matching transcript response can be read
- **THEN** Forge preserves the received reply, emits an observable warning, and does not claim that text integrity was restored

#### Scenario: Conversation identifier is invalid
- **WHEN** a transcript lookup is requested with a non-UUID conversation identifier
- **THEN** Forge rejects the lookup without reading outside the Antigravity transcript root
