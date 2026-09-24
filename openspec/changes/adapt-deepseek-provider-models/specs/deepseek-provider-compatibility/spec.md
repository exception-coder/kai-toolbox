## ADDED Requirements

### Requirement: Official DeepSeek uses protocol-specific endpoints

Forge SHALL route official DeepSeek Claude sessions to its Anthropic-compatible endpoint and list models from the DeepSeek root models endpoint, while preserving generic gateway routing.

#### Scenario: Official DeepSeek profile lists models

- **WHEN** the provider baseURL host is `api.deepseek.com` and the API Key is valid
- **THEN** Forge requests `/models` with Bearer authentication and offers returned model IDs for selection

#### Scenario: Claude session uses official DeepSeek profile

- **WHEN** a Claude session uses an official DeepSeek profile configured with the root or legacy versioned URL
- **THEN** Forge routes the turn through `/anthropic` with that session's Key and selected model

#### Scenario: Generic gateway remains compatible

- **WHEN** the provider baseURL is not the exact official DeepSeek host
- **THEN** Forge retains the existing Anthropic gateway URL and `/v1/models` catalog convention

#### Scenario: User refreshes models within a gateway session

- **WHEN** a third-party Claude session refreshes its model catalog
- **THEN** Forge reuses the provider-specific catalog endpoint and does not replace that catalog with a native Claude SDK model list

### Requirement: Authentication and model catalog results remain distinct

Forge SHALL not present a model catalog from another API Key and SHALL distinguish credential rejection from catalog unavailability.

#### Scenario: Key changes after a successful catalog request

- **WHEN** the same provider address is queried with a different API Key
- **THEN** Forge performs a separate authenticated request instead of reusing the prior Key's cached models

#### Scenario: DeepSeek rejects the Key

- **WHEN** the official DeepSeek model endpoint responds with HTTP 401
- **THEN** Forge reports an authentication recovery action and does not imply manual model entry will resolve it

#### Scenario: Catalog unavailable without a credential rejection

- **WHEN** a gateway catalog cannot be listed for a non-authentication reason
- **THEN** the user may manually enter a model ID in the existing session and explicitly apply it

#### Scenario: Failed turn returns a synthetic SDK message

- **WHEN** Claude SDK reports `<synthetic>` as a model placeholder after a failed gateway turn
- **THEN** Forge does not present it as the model actually served by the upstream API
