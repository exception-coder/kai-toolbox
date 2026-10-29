## ADDED Requirements

### Requirement: Browser-only draw.io rendering
The system SHALL render supported draw.io files using locally hosted frontend resources without an additional backend rendering service.

#### Scenario: Open a multi-page diagram
- **WHEN** a user selects or drops a valid `.drawio` or `.drawio.xml` file
- **THEN** the existing preview displays its diagrams with page selection, zoom, fit and fullscreen controls
- **AND** the original file remains unchanged

#### Scenario: Invalid or oversized diagram
- **WHEN** the input is empty, damaged, truncated or exceeds parsing limits
- **THEN** the preview explains the failure and provides retry or source inspection instead of displaying incomplete results

#### Scenario: Isolated rendering
- **WHEN** a diagram includes external resources or links
- **THEN** the preview blocks external resource requests and link navigation
- **AND** renderer messages are accepted only from the expected frame instance

### Requirement: Preview diagrams directly from AI replies
The system SHALL open local draw.io links in AI replies as an in-place read-only diagram dialog using the existing controlled project path access.

#### Scenario: Click a diagram link
- **WHEN** a user clicks an absolute or relative local draw.io file link in a session reply
- **THEN** the system reads the complete UTF-8 file up to 5 MiB within existing allowed project directories or through the exact verified assistant diagram reference rule below
- **AND** shows the shared diagram preview without leaving the conversation or launching a desktop program
- **AND** closing restores the original message focus without scrolling

#### Scenario: Read rejected or cancelled
- **WHEN** a file is missing, outside both allowed project paths and verified assistant references, oversized or not UTF-8
- **THEN** an error is shown with retry and close actions
- **AND** the system does not fall back to an alternate read or open path
- **WHEN** the dialog closes or its session changes
- **THEN** an outstanding request is cancelled and its stale result is not displayed
### Requirement: 精确授权会话助手引用的外部图文件

系统 SHALL 在登录及会话访问校验后，允许正常开发会话读取该会话助手 Markdown 明确引用的绝对 Draw.io 路径，即使文件位于主目录和已登记项目范围外；引用不得授予目录权限，且保留全局排除、图类型、UTF-8 及大小上限。

#### Scenario: 从助手消息查看其他工程的图文件

- **WHEN** 已授权用户打开当前 standard 会话助手给出的跨目录 `.drawio` 或 `.drawio.xml` 链接
- **THEN** 系统从已核验历史页或绑定原生句柄的最近一页核实精确文件引用并只读返回完整内容
- **AND** 保持原消息与预览弹框上下文

#### Scenario: 未核验或越权引用不扩大访问

- **WHEN** 路径只出现在用户消息、其他会话或裸文本中，属于未引用兄弟文件、全局排除目录，或请求来自无权用户、评审及只读咨询会话
- **THEN** 系统 SHALL 拒绝跨目录引用兼容读取，并保留原失败恢复入口
