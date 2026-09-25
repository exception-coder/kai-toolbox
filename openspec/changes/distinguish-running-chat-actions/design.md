## Context

`ChatPage.tsx` currently chooses steer automatically for running official Codex text and hides the running send button on mobile. `SessionPane.tsx` and `FloatingChatWindow.tsx` expose only interrupt while running. The existing socket hook already provides `steer` and persistent `enqueue`; no protocol work is needed.

## Goals / Non-Goals

Expose the user's choice in all three composers with readable mobile controls. Preserve existing interrupt, attachment, command and focus behavior. No queue scheduler, backend, or route changes.

## Decisions

- A shared small action component renders explicit buttons and eligibility consistently across the three views. Official Codex with no third-party base URL and text without attachments can steer. Other inputs queue only. Queue remains the default Enter route during active turns.
- Running actions occupy their own row in narrow composers so labels remain visible. Interrupt remains separate and never masquerades as a send choice. Button labels remain text at all widths. The current draft is cleared only after the chosen send method is invoked, matching existing behavior.
- Preserve the normal idle Send action. Reuse hook methods rather than duplicating persistence or WebSocket protocol rules.

Applicable product principles: OBJ-01 (the current session remains the object), CTX-01 (choice stays beside draft), DENS-01 (compact but readable control), FEED-01 (queue remains visible in existing queue list), CTRL-01 (explicit destination), IDEM-01 (single action per click). No exception.

## Risks / Trade-offs

- A new action row increases composer height during active turns → keep controls compact and avoid wrapping at narrow phone widths.
- Unsupported steer or attachment state can change while drafting → derive availability from current engine, provider and attachment count at render and submit time.
- Other uncommitted ChatPage changes exist → preserve them and stage only this change's hunks.

## Migration Plan

No data migration. Typecheck, targeted UI behavior tests, quality gate and desktop/mobile visual inspection. Rollback the frontend change to restore prior controls; queued messages already persisted remain valid.

## Open Questions

None. Runtime acceptance of the new frontend requires a separately authorized service restart under AGENTS.md.
