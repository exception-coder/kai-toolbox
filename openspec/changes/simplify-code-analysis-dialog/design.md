## Context

CodeStageNode owns analysis requests, scoring and development permissions. Its inline dialog mixes a repeated score, nested effort cards, long evidence and settings. Existing Radix Dialog and semantic theme tokens provide modal behavior and styling. Use the global design registry in conservative mode with the project's quiet-luxury-ui override.

## Goals / Non-Goals

Improve hierarchy, legibility, keyboard access and recovery. Preserve calculation and request semantics; do not change backend contracts or task execution.

## Decisions

- Extract a feature-local CodeAnalysisDialog presentation component, keeping state and requests in CodeStageNode.
- Use a single neutral surface, readable 12–14px supporting text, a concise score/effort summary and native details disclosures. A tabbed rewrite would fragment the short workflow.
- Use the already installed Radix Dialog for focus containment, Escape and portal behavior; reuse the fullscreen portal container.
- Keep stale results and errors visible even when supporting details are collapsed. Maintain a fixed action footer and scrolling body on narrow screens.
- Guard request submission locally until server state updates, avoiding duplicate clicks during the existing background-start request.

## Risks / Trade-offs

Hidden details require one extra interaction but remain directly discoverable. Test disclosure, submission lock, keyboard close and empty/running states. Prior browser access was denied; do not bypass that denial. Record visual verification as outstanding unless authorized.

## Migration Plan

Frontend-only rollout; revert the component and call site together if needed.

## Open Questions

None for implementation.
