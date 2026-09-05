## ADDED Requirements

### Requirement: 会话监督状态使用规范接口路径读取
系统 SHALL 通过规范的会话自动监督状态接口读取当前运行，并 MUST 保持客户端基础路径与功能路径只组合一次。

#### Scenario: 读取当前会话监督状态
- **WHEN** 页面请求会话的自动监督状态
- **THEN** 客户端向 `/api/claude-chat/sessions/{sessionId}/autopilot` 发送一次鉴权 GET 请求
- **AND** 请求路径不得包含重复的 `/api/api` 前缀

#### Scenario: 当前会话没有监督运行
- **WHEN** 规范状态接口返回 HTTP 204
- **THEN** 页面将当前运行解释为未启用而不是请求失败
