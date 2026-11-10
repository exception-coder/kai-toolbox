## ADDED Requirements

### Requirement: Structured project philosophy
The project SHALL maintain one product and interaction philosophy document with stable principle IDs, scope, decisions, exceptions, evidence and verification criteria, routed from AGENTS and the documentation index.

#### Scenario: New interaction design
- **WHEN** an Agent adds a navigation destination or object action
- **THEN** it checks the object/action/view decision rules and records applicable exceptions and validation in its OpenSpec change

#### Scenario: Local user preference
- **WHEN** a project-specific interaction preference is accepted
- **THEN** its source and scope are recorded without silently promoting it into a universal or global profile rule
