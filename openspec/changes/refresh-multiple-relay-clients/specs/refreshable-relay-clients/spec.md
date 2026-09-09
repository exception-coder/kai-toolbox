## ADDED Requirements

### Requirement: Reuse the configuration center
Forge SHALL manage Relay through the existing configuration block CRUD API and persist overrides across restart without introducing a second configuration module.

#### Scenario: Configure after startup
- **WHEN** an administrator saves multiple Relay clients in the existing configuration center
- **THEN** the saved clients authenticate without restarting Forge and remain configured after restart

### Requirement: Independent client identities
Each managed client SHALL have a unique nonblank Client ID, name, Secret and enabled state. Authentication SHALL retain its client ID in existing Relay audit correlation.

#### Scenario: Rotate or disable one client
- **WHEN** an administrator rotates or disables one client's credentials
- **THEN** subsequent authentication with its old credentials fails while other enabled clients continue authenticating

#### Scenario: Reject invalid configuration
- **WHEN** duplicate IDs or missing required fields are submitted
- **THEN** the operation fails without replacing the active configuration or persisting invalid values

### Requirement: Removal refresh and compatibility
Forge SHALL refresh from complete configuration state, including deletions. Explicit managed mode SHALL prevent fallback to legacy credentials even when its client list is empty. Explicit reset SHALL restore deployment defaults.

#### Scenario: Remove last managed client
- **WHEN** an administrator saves an empty managed client list
- **THEN** all managed and legacy credentials are rejected after save and after restart

#### Scenario: Existing deployment
- **WHEN** managed mode is not selected
- **THEN** the existing configured single Relay credential retains its previous behavior

### Requirement: Recoverable editing
The existing configuration page SHALL support adding, editing and removing Relay clients, preserve unsaved input on save failure, and display operation failures. Business pages SHALL be able to reuse the same backend configuration API.

#### Scenario: Save fails
- **WHEN** a save cannot validate or persist
- **THEN** the editor retains the draft and displays a failure while the previously active configuration remains usable
