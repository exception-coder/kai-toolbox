## ADDED Requirements

### Requirement: Keep queued messages accessible above monitoring

The Agent control panel SHALL display the current session queue directly below its title, separate from the scrollable operations and monitoring content.

#### Scenario: Long session list

- **WHEN** the panel contains many recent sessions and the user scrolls its operations and monitoring area
- **THEN** the queue remains available above that area with its existing message actions

#### Scenario: Empty or paused queue

- **WHEN** the queue is empty or paused
- **THEN** the queue section shows its count and empty state or pause explanation without automatically sending a message

#### Scenario: Background work delays queued messages

- **WHEN** background tasks are active and queued messages await dispatch without a real pause reason
- **THEN** desktop and mobile summaries show waiting for background work without a queue pause warning
- **AND** the queue explanation describes the wait without sending or resuming a message

#### Scenario: A real pause takes precedence over background waiting

- **WHEN** a pause reason and active background tasks are both present
- **THEN** the queue shows its pause explanation and retains existing guarded recovery actions

### Requirement: Prioritize functional controls

The panel SHALL place available functional controls and session switching before runtime metrics and diagnostics while retaining existing callbacks and sending guards.

#### Scenario: Inspect controls

- **WHEN** the user opens the panel
- **THEN** functional controls precede the runtime overview, execution details and diagnostic information
