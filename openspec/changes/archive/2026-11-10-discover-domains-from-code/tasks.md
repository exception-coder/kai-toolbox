## 1. Domain discovery

- [x] 1.1 Implement bounded graph context, domain schema and citation validation.
- [x] 1.2 Add persisted read-only Agent execution, recovery and snapshot publication.
- [x] 1.3 Connect the domain panel, System Profile and task context.
- [x] 1.4 Run focused regressions, builds and quality gate; record API and runtime verification limits.

## Verification evidence

- Backend: 34 distinct tests passed: DomainExplorationTest (12), LocalProjectEvidenceAdapterTest (7), ProjectRegistryIntegrationTest (11), GraphifyPublicationTest (4). The package run covered 33 tests; the final focused run covered all 12 domain tests after adding task handoff coverage. Both completed with exit 0.
- Command: `mvn -pl tools/tool-projects -am package "-Dtest=DomainExplorationTest,LocalProjectEvidenceAdapterTest,ProjectRegistryIntegrationTest,GraphifyPublicationTest" "-Dsurefire.failIfNoSpecifiedTests=false"`. Final focused command replaced package with test and selected DomainExplorationTest.
- Frontend: SystemDomainsPanel (3), RegistryManagement (6), ProjectRegistrationForm (2), typecheck and production build passed. Existing bundle-size warnings remain.
- Forge quality: exit 0 and JSON status PASSED; executedCheckers was empty, and 9 existing API runtime scenarios passed. These scenarios do not cover the new domain endpoints.
- OpenSpec strict validation passed. Completeness: implementation and tests cover all requirements. Correctness: exact source/graph references, scope boundaries, duplicate prevention, restart recovery, drift and failure preservation covered. Coherence: one snapshot feeds domains, profile evidence and task handoff; OpenSpec-only input remains MISSING.
- Real Codex/Claude inference, deployed endpoint probing and browser visual acceptance were not executed. The backend was not restarted. Existing browser access denial was respected. Keep the change active for runtime acceptance.

## HTTP impact record

The Forge API registration call returned `user rejected MCP tool call`; no retry was made and no remote registration is claimed. Local evidence is retained here.

- ADDED `GET /api/project-registry/{id}/domains`: ProjectDomainController.view; reads snapshot, run and freshness. MockMvc reads the published domain and status successfully with a mocked Agent.
- ADDED `POST /api/project-registry/{id}/domains/explore`: ProjectDomainController.explore; accepts engine/scope and returns 202 before background publication. MockMvc and service tests pass with a mocked Agent.
- MODIFIED `POST /api/project-registry/{id}/init`: ProjectRegistryController.initialize delegates to SystemInitService; SEMANTIC now collects a code-derived snapshot and marks drift. Adapter and registry tests pass.
- MODIFIED `GET /api/project-registry/{id}/tasks/{taskId}/context`: ProjectRegistryController.context delegates to SystemTaskService; selected domain evidence and explicit freshness/trust boundaries are appended. DomainExplorationTest.taskHandoffIncludesSelectedDomainAndExplicitFreshnessBoundary passes.
- Controllers are under `tools/tool-projects/src/main/java/com/exceptioncoder/toolbox/projects/registry/api/`; orchestration is under `registry/application/`. No manual database migration or pending SQL was produced.
