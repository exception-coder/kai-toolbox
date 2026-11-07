## ADDED Requirements

### Requirement: Forge uses project-owned knowledge

Forge SHALL use authorized project documents and targeted source evidence under the team suite rules, with inferred conclusions marked pending confirmation.

#### Scenario: User initializes knowledge from a project workspace

- **WHEN** the user selects 整理项目知识
- **THEN** Forge starts init-project-docs in that project with document reuse, knowledge gap review and a draw.io panorama

#### Scenario: Legacy query requests topology

- **WHEN** a historical request uses topology or all
- **THEN** the topology result is RETIRED and all may additionally return current authorized project documents

### Requirement: Central graph services remain retired

Forge SHALL avoid registering, launching, recovering or reading the retired central knowledge graph services and SHALL preserve historical records for reading.

#### Scenario: Suite update encounters legacy configuration

- **WHEN** saved configuration still names a retired knowledge repository or MCP
- **THEN** repository sync skips it and dependency installation removes the named legacy registration

#### Scenario: Old client invokes graph status or topology analysis

- **WHEN** a client invokes an old graph status or analysis endpoint
- **THEN** Forge responds with 410 and historical links remain readable
