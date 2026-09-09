## 1. Analysis contract

- [x] 1.1 Add the stable requirement progress Agent abstraction and orchestration metadata
- [x] 1.2 Resolve explicit OpenSpec task context and expose a clear degraded mode when unbound
- [x] 1.3 Update the prompt and deterministic claim validation to enforce the evidence hierarchy

## 2. Agent governance

- [x] 2.1 Generalize the Agent repository and service from one hard-coded Agent to agent-scoped operations
- [x] 2.2 Register the requirement progress Agent, capabilities, default version, and regression dataset
- [x] 2.3 Add generic multi-Agent APIs while preserving the legacy business-consult route

## 3. User experience

- [x] 3.1 Update Agent Management to list and select registered Agents
- [x] 3.2 Surface the OpenSpec-bound or degraded analysis mode in requirement progress feedback

## 4. Verification and delivery

- [x] 4.1 Add backend contract and orchestration tests
- [x] 4.2 Run OpenSpec strict validation, focused Maven tests, frontend typecheck/build, and Forge quality gate
- [x] 4.3 Confirm no new HTTP contract requires registration and commit only this change

## 5. Two-agent requirement workflow

- [x] 5.1 Register the requirement specification Agent with capabilities, version and regression dataset
- [x] 5.2 Replace hard-coded Agent catalog selection with an explicit registry
- [x] 5.3 Add a unified specification/progress node-run projection and duplicate-run affordances in the requirement hub
- [x] 5.4 Add backend and frontend regression coverage for the two-Agent contract and node states
- [x] 5.5 Run strict OpenSpec validation, focused tests, builds and Forge quality gate
