## ADDED Requirements

### Requirement: Administrators configure the ordinary-user default model
The system SHALL allow an administrator to select a model from the current Codex catalog and persist both its actual model identifier and display name as the business consultation default.

#### Scenario: Administrator saves the displayed 5.6 Sol model
- **WHEN** an administrator selects the catalog entry currently displayed as GPT-5.6-Sol or 5.6 Sol and saves it as default
- **THEN** the system persists that entry's current model identifier and display name
- **AND** the system does not derive the identifier from a hard-coded model slug

### Requirement: Ordinary-user consultations use the configured default model
The system SHALL persist and dispatch every newly created consultation from a non-administrator with the administrator-configured default model, regardless of an omitted or different client-supplied model.

#### Scenario: Ordinary user supplies another model
- **WHEN** a non-administrator creates a business consultation with any client-supplied model
- **THEN** the server ignores that value and uses the configured default model

#### Scenario: Default model is not configured
- **WHEN** a non-administrator attempts to create a business consultation before an administrator configures the default model
- **THEN** the system rejects creation with a recoverable configuration message

### Requirement: Business consultation presents the model as fixed
The business consultation interface SHALL show the configured default model as read-only for non-administrators, while preserving administrator model selection and existing authorization rules for other consultation runtime options.

#### Scenario: Ordinary user opens consultation options
- **WHEN** a non-administrator opens the Codex options for a new business consultation
- **THEN** the configured display name is shown and model selection is unavailable

#### Scenario: Administrator opens consultation options
- **WHEN** an administrator opens the Codex options for a new business consultation
- **THEN** model selection remains available from the current catalog
- **AND** the selected model can be saved explicitly as the ordinary-user default

### Requirement: Existing consultations preserve their model snapshot
The system SHALL NOT rewrite the saved model of an existing business consultation when the configured policy is introduced or changed.

#### Scenario: Existing consultation is reopened
- **WHEN** a user reopens a consultation created before this policy
- **THEN** the consultation continues to expose its original saved model snapshot

### Requirement: 管理员统一配置业务咨询默认 Auth 目录
系统 SHALL 由管理员在业务咨询中配置唯一的默认 Codex Auth 目录，并 MUST 由服务端将该目录作为所有用户新建咨询的权威值。客户端提交的 Auth 目录不得覆盖该策略；普通用户 SHALL 只读看到当前配置。已创建咨询 MUST 继续使用创建时持久化的 Auth 目录快照。

#### Scenario: 管理员保存默认 Auth 目录
- **WHEN** 管理员从服务端发现的 Codex Auth 目录中选择目录并保存业务默认配置
- **THEN** 系统将该规范化目录与默认模型一起持久化到单例策略
- **AND** 页面显示保存成功后的权威配置

#### Scenario: 任意用户新建咨询
- **WHEN** 任意用户在默认 Auth 目录已配置后新建业务咨询
- **THEN** 服务端忽略请求中的 Auth 目录覆盖值并使用已保存目录
- **AND** 新咨询记录保存该目录快照

#### Scenario: 普通用户查看配置
- **WHEN** 普通用户打开业务咨询配置
- **THEN** 页面只读显示管理员配置的 Auth 目录
- **AND** 不提供修改或逐次覆盖该目录的入口

#### Scenario: 默认 Auth 目录尚未配置
- **WHEN** 用户尝试在默认 Auth 目录为空时新建业务咨询
- **THEN** 系统拒绝创建且不产生部分会话记录
- **AND** 页面提示联系管理员完成业务默认配置

#### Scenario: 继续既有咨询
- **WHEN** 用户刷新、恢复或追问已经创建的业务咨询
- **THEN** 系统继续使用该咨询持久化的 Auth 目录快照
- **AND** 后续管理员修改默认目录不改变既有咨询
