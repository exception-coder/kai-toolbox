## ADDED Requirements

### Requirement: Respect feature default menu visibility

The system SHALL omit supplier-quote-h5 from default sidebar and home menus while retaining its routes and menu preference option. Explicit saved preferences SHALL take precedence.

#### Scenario: Default or reset preferences

- **WHEN** no menu preferences exist or the user restores defaults
- **THEN** supplier-quote-h5 is absent from visible menus while other default features remain available

#### Scenario: Explicitly enable supplier quotes

- **WHEN** the user enables supplier-quote-h5 in menu preferences or has already saved that choice
- **THEN** its menu entry remains visible and its existing route remains registered
