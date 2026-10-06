# Module execution

## ADDED Requirements

### Requirement: Module scoped execution concurrency

Forge SHALL permit separate active writing executions for disjoint module scopes in the same project and branch. Forge SHALL reject a new execution when its scope intersects an active execution or claims a repository-wide build or database path.

#### Scenario: Disjoint modules

- **WHEN** one session holds a writing execution for module A and another session assesses files only in module B
- **THEN** the second execution is bound without releasing or changing the first execution

#### Scenario: Same module or shared file

- **WHEN** a session assesses a module already held by another session, declares a root build file or migration while another execution is active, or targets the same OpenSpec Change or design file as another execution
- **THEN** Forge rejects the overlapping writing claim and preserves existing bindings

### Requirement: Independent execution recovery

Forge SHALL expose all active writers and SHALL release only the identified execution on explicit abort or verified completion. A commit touching only another module SHALL NOT prove that an execution has finished.

#### Scenario: Abort one of two module executions

- **WHEN** an operator supplies the inspected identity, HEAD, and scope fingerprint for one active execution
- **THEN** only that execution is audited and released; the other remains bound

#### Scenario: Unrelated commit

- **WHEN** HEAD advances through a different module while the current execution has no commit in its own scope
- **THEN** the current execution remains active and cannot be automatically reclaimed

### Requirement: Existing ownership is projected from original execution evidence

Forge SHALL validate project, execution and session identities and any existing session binding before recomputing claims from the original complete discovery files, design files and change. This applies to both legacy single pointers and multi-writer indexes. Missing or inconsistent evidence SHALL fail explicitly without clearing pointers. Projection SHALL preserve execution history, verification and exact write permissions.

#### Scenario: An old global claim includes ordinary governance files

- **WHEN** an existing writer's persisted scopes contain `*` but its validated original files belong to one module and ordinary governance files
- **THEN** reads expose the recomputed narrower claims without modifying the execution record or granting undeclared files

#### Scenario: Legacy and new writers coexist

- **WHEN** an independent writer is bound while a legacy single writer remains active
- **THEN** the legacy execution is represented once and either writer can be released without releasing the other

#### Scenario: An undeclared migration is attempted after projection

- **WHEN** the original writer attempts to write V096 outside its declared exact file list
- **THEN** Forge returns `IMPLEMENTATION_SCOPE_DRIFT` until the formal scope update succeeds
