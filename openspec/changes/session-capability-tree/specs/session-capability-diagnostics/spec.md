## ADDED Requirements

### Requirement: Runtime capability snapshot

系统 SHALL 为当前会话提供带来源和刷新时间的能力快照，并区分运行时已验证与仅配置可见的数据。

#### Scenario: Codex App Server runtime is available

- **WHEN** 当前 Codex 会话的 App Server 能成功查询能力目录
- **THEN** 快照包含运行时 MCP 状态、每个 MCP 的 Tool 清单、插件目录和 Skills 目录
- **AND** 快照来源标记为 App Server 运行时

#### Scenario: Runtime inspection is unavailable

- **WHEN** App Server 能力查询失败或会话已回退 SDK
- **THEN** 系统保留可取得的配置态 MCP 名称
- **AND** 明确标记能力未完成运行时验证及失败原因

### Requirement: MCP and Tool diagnostics

系统 SHALL 按 MCP 服务聚合当前会话实际可调用的 Tools，并展示连接、认证和服务版本信息。

#### Scenario: Tool injection is confirmed

- **WHEN** App Server 返回某 MCP 的连接状态和非空 Tool 目录
- **THEN** 面板在该 MCP 节点下展示完整 Tool 名称与数量
- **AND** 将该节点标记为运行时已验证

#### Scenario: Configured MCP has no runtime tools

- **WHEN** MCP 已配置但运行时未连接或 Tool 目录为空
- **THEN** 面板不得把该 MCP 标记为已注入
- **AND** 展示运行状态和可执行的刷新或重启提示

### Requirement: Plugin and Skill diagnostics

系统 SHALL 展示当前 Auth 目录可见插件的安装、启用和版本状态，并按插件归属展示当前工作目录加载的 Skills。

#### Scenario: Installed plugin is current

- **WHEN** 插件已安装且本地版本与目录提供的远端版本一致
- **THEN** 插件节点展示当前版本和已启用 Skills
- **AND** 状态标记为已是最新

#### Scenario: Installed plugin is outdated

- **WHEN** 插件本地版本与远端版本均存在且不一致
- **THEN** 插件节点同时展示本地版本和远端版本
- **AND** 状态标记为可更新

#### Scenario: Skill has no plugin owner

- **WHEN** App Server 返回的 Skill 不包含插件归属
- **THEN** 系统按其 user、repo、system 或 admin 范围归入独立 Skills 分组

### Requirement: Recoverable tree experience

系统 SHALL 以紧凑、可展开且响应式的树形界面展示能力，并为加载、空数据、降级和失败提供明确反馈。

#### Scenario: Large capability catalog

- **WHEN** 当前会话包含多个 MCP、Tools、Plugins 或 Skills
- **THEN** 用户可以逐层展开和收起节点
- **AND** 异常或版本不一致节点优先展开

#### Scenario: Refresh capability catalog

- **WHEN** 用户点击刷新
- **THEN** 系统重新查询当前会话绑定的 Auth 目录和工作目录
- **AND** 原位更新快照来源、刷新时间、状态和树内容

### Requirement: Per-capability provenance

系统 SHALL 为 MCP、Tool、Plugin 和 Skill 提供逐项来源与作用域，不得只用整份快照的来源代表所有能力。

#### Scenario: Forge session MCP is active

- **WHEN** MCP 位于 Forge 为当前会话构建的注入清单且 App Server 返回其运行时状态
- **THEN** MCP 及其 Tools 的有效来源标记为 `forge-session`
- **AND** 作用域标记为当前 `session`

#### Scenario: Auth-global MCP is active

- **WHEN** MCP 位于当前 Auth 目录配置且不被 Forge 当前会话配置覆盖
- **THEN** MCP 及其 Tools 的有效来源标记为 `engine-auth-global`
- **AND** 作用域标记为 `auth-directory`

#### Scenario: Plugin contributes a capability

- **WHEN** App Server 为 MCP 或 Skill 返回 `pluginId`
- **THEN** 来源标记为 `plugin` 并保留对应插件 ID
- **AND** 系统不得根据名称猜测插件归属

#### Scenario: Same MCP has multiple configuration sources

- **WHEN** 同名 MCP 同时出现在 Forge 会话配置与 Auth 全局配置中
- **THEN** 系统保留两条来源证据
- **AND** Forge 会话来源标记为当前有效，Auth 来源标记为被覆盖

#### Scenario: Provenance cannot be proven

- **WHEN** 运行时能力无法匹配任何确定性来源
- **THEN** 来源标记为 `unknown`
- **AND** 页面明确显示“来源未确认”，不得推断为 Forge 或全局能力
