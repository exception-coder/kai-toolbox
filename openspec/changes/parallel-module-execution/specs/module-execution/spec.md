# Module execution

## ADDED Requirements

### Requirement: Module scoped execution concurrency

Forge SHALL permit separate active writing executions for disjoint module scopes in the same project and branch. Forge SHALL reject a new execution when its scope intersects an active execution or contains a shared project path.

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
