## ADDED Requirements

### Requirement: Unified local tools navigation

The system SHALL provide one 本机工具 menu containing 目录扁平化, 端口进程查询, Web 终端 and VS Code Tunnel tabs, preserving each tool's original authorization.

#### Scenario: Authorized tools
- **WHEN** a user opens the workspace
- **THEN** only independently authorized tools are available and the first available tool opens by default
- **AND** a permission to the combined menu alone does not grant a child tool

#### Scenario: Invalid or unauthorized target
- **WHEN** the URL specifies an unavailable tool
- **THEN** its content is not mounted and the page offers available tabs or a home recovery link

### Requirement: Stable tool context

The system SHALL mount each tool only on first activation and retain visited panels while navigating within the workspace.

#### Scenario: Switching away and back
- **WHEN** a user changes tabs after editing input or opening a terminal
- **THEN** the input and terminal instance remain and unvisited tools are not initialized

### Requirement: Compatible deep links and menu preferences

The system SHALL redirect all four old URLs to their respective tabs while preserving query parameters and hash, and migrate previous visible tool menu IDs to the combined entry.

#### Scenario: Terminal project link
- **WHEN** a user follows /tools/webterm with cwd and autorun parameters
- **THEN** the terminal tab opens with those parameters and the original autorun validation remains effective

### Requirement: Accessible adaptive workspace

The system SHALL provide one page heading, keyboard accessible tabs and usable panels within the Shell viewport.

#### Scenario: Keyboard selection
- **WHEN** arrow keys or Home/End are used in the tab list
- **THEN** focus moves without mounting tools and Enter or Space activates the focused tab

#### Scenario: Narrow or short viewport
- **WHEN** the viewport shrinks
- **THEN** tabs can scroll horizontally, tool controls remain reachable and the terminal resizes within available height
