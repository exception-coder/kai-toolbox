## ADDED Requirements

### Requirement: Supplier quotation is absent from Forge

Forge SHALL omit supplier quotation from its feature registry, menu preferences, routes, configuration catalog and backend business endpoints.

#### Scenario: Existing menu preference

- **WHEN** a user has previously enabled supplier-quote-h5
- **THEN** the sidebar, home and preferences do not offer the retired feature

#### Scenario: Configuration catalog

- **WHEN** configuration groups are loaded
- **THEN** regentech.supplier-quote.account and regentech.supplier-quote.wechat are absent

#### Scenario: Old route and API

- **WHEN** a user opens the old quotation route or calls its Forge API
- **THEN** no quotation workflow is served, the old API returns HTTP 404 and the frontend uses its existing unavailable-route recovery

### Requirement: Independent quotation application is preserved

The shared quotation implementation and standalone H5 build SHALL remain available to wyoooni-application, and retirement SHALL NOT delete persisted data.

#### Scenario: Standalone build

- **WHEN** the independent application builds its H5
- **THEN** the existing h5:build command still produces the standalone quotation app
