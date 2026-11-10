## Why

The Project Registry domain tab currently shows OpenSpec file references instead of code-derived domains. Projects without existing domain documentation need a first-class exploration workflow that starts from Graphify and actual source evidence.

## What Changes

- Run a project-scoped, read-only Codex or Claude exploration from the domain tab with persisted progress and recoverable failure.
- Seed exploration with a bounded Graphify community/source index, then use existing source_context/source_read tools.
- Validate structured domain drafts, graph references and exact source citations before publishing a versioned domain snapshot.
- Display business/technical domains, responsibilities, flows, route/API/table findings and unknowns; connect snapshots to System Profile and task context.

## Capabilities

### New Capabilities

- `code-derived-domains`: Evidence-grounded domain discovery without preexisting knowledge.

### Modified Capabilities

None.

## Impact

tool-projects registry, a dependency on the existing toolbox-llm SPI, and project-workspace UI. No new extraction algorithm, database schema, LLM framework or automatic semantic approval. No project source changes by the Agent. Graphify remains structural authority; OpenSpec is optional evidence.
