## ADDED Requirements

### Requirement: Expand the current changes window

The pending-changes dialog SHALL offer full-viewport and restored window sizes without changing its repository, selected file, filters or loaded diff.

#### Scenario: Expand and restore a diff

- **WHEN** the user expands and restores a loaded diff
- **THEN** the same content and scrolling nodes remain mounted and no additional Git query is issued

#### Scenario: Keyboard recovery

- **WHEN** Escape is pressed in full-viewport mode
- **THEN** the dialog returns to its restored size and remains open; Escape in restored mode closes the dialog

#### Scenario: Close after comparison

- **WHEN** the dialog closes
- **THEN** focus returns to the originating control and the background is interactive again
