## Context

AgentOneShotRunner supports both engines with project cwd and consult-readonly policy, including Graphify source_context and bounded source_read/search. Its concrete runner enforces a configured wall-clock timeout. RegistrySourceScanner fingerprints source inputs. Existing graph.json contains structural nodes and optional community labels, which are not themselves business domains.

## Decisions

- Compose the existing runner through toolbox-llm; use a fixed versioned exploration prompt and at most two attempts for invalid structured output. No autonomous writes or new tool loop.
- Read graph nodes with streaming JSON, retaining bounded identity/source/community metadata. Provide representative seeds and explicit sampling gaps; require the Agent to inspect source and report uncovered areas.
- Persist one current domain snapshot and one run record under project-owned .forge/domains. Files are excluded from source fingerprints. Atomic snapshot publication preserves the old snapshot on validation/execution failure. A per-project OS file lock prevents duplicate jobs; abandoned RUNNING records are reported interrupted after restart.
- Validate domain enums/size/IDs, graph-node membership, project-contained source paths and exact quoted line ranges. Decode source as strict UTF-8 with GB18030 fallback for legacy projects, without rewriting files. A valid quote proves the reference exists, not the inferred business meaning or runtime DB truth.
- Store all generated semantics as code-derived inference with confidence/unknowns. Missing/old graph or changed source during exploration is explicit; never publish inferred facts as human-confirmed truth.
- The domain panel reads current results directly. System Init reads that same snapshot as SEMANTIC evidence instead of treating OpenSpec presence as discovered domains. Task handoff includes current domain context and stale warnings.
- Re-exploration replaces the current bounded snapshot after successful validation; it does not claim semantic incremental reconciliation. Scope and remaining gaps are visible. Prior results remain available until successful replacement.

## Risks / Trade-offs

Large projects may exceed exploration coverage in one run: bound graph size, result count, source bytes and prompt seeds; state gaps rather than invent completeness. LLM citations can fail validation: retry once with the concrete error, then preserve old results. Raw output is never executed. Platform Agent authentication/default model configuration remains necessary. Runtime defaults and resource limits are inherited from the tested local runner; no claim of live engine success without actual execution.

## Verification

Test graph/citation parsing, forged quotes and paths, legacy encoding, stale detection, successful/failed publication and read-only execution configuration using controlled runner fixtures. Verify UI state/actions, frontend/backend builds and Forge quality. Register changed HTTP contracts. Live engine and browser checks must be reported separately.

## Research

Graphify official repository: https://github.com/Graphify-Labs/graphify . Anthropic workflow composition and environmental evidence: https://www.anthropic.com/engineering/building-effective-agents . Use these design principles with the installed runtime; do not migrate SDKs or rely on community labels as semantic truth.
