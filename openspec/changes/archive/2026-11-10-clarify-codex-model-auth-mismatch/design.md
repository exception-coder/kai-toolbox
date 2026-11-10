## Context

`CodexSessionOptions` currently derives its label from `selectedModel?.displayName || model`, so a persisted model remains visually valid even when the current Auth directory's refreshed `model/list` no longer contains it. `sessionManager.ts` and `codexAppServer.ts` correctly isolate model discovery by `session.codexHome`; the defect is presentation and recovery, not catalog loading.

## Goals / Non-Goals

**Goals:**

- Distinguish a successful refresh with an Auth-specific catalog from a stale UI.
- Preserve the selected model until the user explicitly changes it.
- Provide a direct recovery to the current Auth default and guidance for changing Auth through session copy.

**Non-Goals:**

- Do not merge catalogs across Auth directories.
- Do not mutate `codexHome` for an existing session.
- Do not add an API, database field or automatic model fallback.

## Decisions

1. Derive mismatch locally from `model`, `models` and `codexHome`. These values already represent the persisted selection and authoritative catalog, so no protocol expansion is needed.
2. Only report a mismatch when the catalog is non-empty. An empty catalog can mean loading or refresh failure and must retain the existing empty-state explanation.
3. Keep recovery explicit. “使用当前 Auth 默认模型” calls the existing `onModelChange('')`; changing Auth remains a copy-session workflow because the session's authorization identity is intentionally stable.
4. Render an inline, compact status inside the model section and a short suffix on the collapsed control. This follows the existing quiet enterprise UI hierarchy without introducing another modal or global alert.

## Risks / Trade-offs

- [Risk] A temporarily incomplete non-empty catalog could flag a valid model → Mitigation: explain that the result belongs to the current Auth and retain the selection until explicit action.
- [Risk] Long Auth paths reduce scanability → Mitigation: show the full path in compact wrapping text rather than truncating the evidence.

## Migration Plan

The change is frontend-only and backward compatible. Rollback consists of reverting the component and test commit; persisted session configuration is untouched.

## Open Questions

None.
