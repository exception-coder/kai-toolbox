## Purpose
外部业务用户持续实施答疑。

## ADDED Requirements

### Requirement: Scoped persistent user conversation
服务 SHALL 将可选 externalUserId 与认证 clientId、授权 tenantId 共同绑定稳定 Codex 会话，不接受调用方提供原生 thread 身份。省略参数保持无状态分析。

#### Scenario: Resume and isolate
- **WHEN** 同一用户以新 requestId 提交后续消息
- **THEN** 续接同一原生线程；不同应用、租户或用户不得共享线程。

#### Scenario: Unknown execution
- **WHEN** 执行结果不确定或线程不可恢复
- **THEN** 返回明确失败或待核对状态，不自动重放或替换线程；重复请求保持原身份。

### Requirement: Stable instruction and explicit message disposition
服务 SHALL 将实施答疑规则作为每轮开发者指令，保留用户资料的不可信边界，并返回明确消息处理动作。

#### Scenario: Chatter and follow-up
- **WHEN** 收到无关闲聊或已知问题的简短追问
- **THEN** 前者 IGNORE 且无回复，后者关联上下文回答；空回复不能自动等同人工转交。

### Requirement: SDK provenance and aggregation evidence
SDK 响应 SHALL 提供用户和会话关联，实施答疑会话标题以 -实施答疑 结尾；文档说明接入方按消息及回复记录归并问题。

#### Scenario: Daily review
- **WHEN** 接入方执行日终归并
- **THEN** 以明确时区、消息记录和处理结果整理问题及回复，区分建议回复与实际外发，支持迟到结果补算。
