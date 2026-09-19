## ADDED Requirements

### Requirement: Administrators configure the ordinary-user default model
The system SHALL allow an administrator to select a model from the current Codex catalog and persist both its actual model identifier and display name as the business consultation default.

#### Scenario: Administrator saves the displayed 5.6 Sol model
- **WHEN** an administrator selects the catalog entry currently displayed as GPT-5.6-Sol or 5.6 Sol and saves it as default
- **THEN** the system persists that entry's current model identifier and display name
- **AND** the system does not derive the identifier from a hard-coded model slug

### Requirement: Ordinary-user consultations use the configured default model
The system SHALL persist and dispatch every newly created consultation from a non-administrator with the administrator-configured default model, regardless of an omitted or different client-supplied model.

#### Scenario: Ordinary user supplies another model
- **WHEN** a non-administrator creates a business consultation with any client-supplied model
- **THEN** the server ignores that value and uses the configured default model

#### Scenario: Default model is not configured
- **WHEN** a non-administrator attempts to create a business consultation before an administrator configures the default model
- **THEN** the system rejects creation with a recoverable configuration message

### Requirement: Business consultation presents the model as fixed
The business consultation interface SHALL show the configured default model as read-only for non-administrators, while preserving administrator model selection and existing authorization rules for other consultation runtime options.

#### Scenario: Ordinary user opens consultation options
- **WHEN** a non-administrator opens the Codex options for a new business consultation
- **THEN** the configured display name is shown and model selection is unavailable

#### Scenario: Administrator opens consultation options
- **WHEN** an administrator opens the Codex options for a new business consultation
- **THEN** model selection remains available from the current catalog
- **AND** the selected model can be saved explicitly as the ordinary-user default

### Requirement: Existing consultations preserve their model snapshot
The system SHALL NOT rewrite the saved model of an existing business consultation when the configured policy is introduced or changed.

#### Scenario: Existing consultation is reopened
- **WHEN** a user reopens a consultation created before this policy
- **THEN** the consultation continues to expose its original saved model snapshot
