## ADDED Requirements

### Requirement: Retired feature is unavailable

Forge SHALL exclude visitor analysis from frontend routes, generated feature catalog, backend modules and runtime services.

#### Scenario: Start Forge after retirement

- **WHEN** Forge starts with legacy visitor enable flags
- **THEN** no visitor analysis service or API is registered
- **AND** no visitor analysis menu is offered

### Requirement: Dedicated configuration is retired

Forge SHALL remove visitor-specific bundled configuration and preserve shared service configuration.

#### Scenario: Inspect configuration after migration

- **WHEN** the configuration center is loaded after retirement
- **THEN** no visitor analysis configuration block is exposed
- **AND** AI secretary and shared LLM configuration remain available

### Requirement: Preserve historical data

Retirement SHALL preserve historical business data and back up local configuration before resetting dedicated overrides.

#### Scenario: Clean local overrides

- **WHEN** visitor-specific configuration overrides are reset
- **THEN** a recoverable backup exists
- **AND** unrelated overrides and historical visitor tables remain unchanged
