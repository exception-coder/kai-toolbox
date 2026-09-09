## ADDED Requirements

### Requirement: Model selection identifies authorization mismatch
The model configuration SHALL identify when a persisted Codex model is absent from the non-empty model catalog returned for the current session authorization directory.

#### Scenario: Selected model is absent from the current catalog
- **WHEN** a Codex session has a non-empty selected model and the refreshed non-empty catalog does not contain it
- **THEN** the configuration entry and model picker show that the model is unavailable under the current Auth directory
- **AND** the picker identifies the Auth directory that supplied the catalog

#### Scenario: Selected model is available
- **WHEN** the selected model exists in the current catalog
- **THEN** the configuration displays the normal model label without a mismatch warning

### Requirement: Mismatch recovery remains explicit
The model configuration MUST preserve the persisted selection until the user explicitly chooses a recovery action.

#### Scenario: User adopts current Auth default
- **WHEN** the user chooses to use the current Auth default model
- **THEN** the system clears the explicit model selection through the existing model-change contract
- **AND** the model picker returns to its parent configuration view

#### Scenario: User needs another Auth directory
- **WHEN** the selected model is absent and the current session Auth cannot be changed in place
- **THEN** the interface explains that the user can copy the session and select another Auth directory
