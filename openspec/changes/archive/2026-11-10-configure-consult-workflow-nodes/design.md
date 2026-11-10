## Context

ConsultOrchestrationPipeline.orchestrate 当前按版本组装提示词；ConsultAgentManagementRepository 保存整体能力但没有节点快照。SidecarClient.userMessage 为服务端消息边界，Codex 使用 enabled_tools，Claude 使用 MCP 装配及 canUseTool。当前 Graphify 仅作导航，已通过定向源码核对这些入口。

## Goals / Non-Goals

目标是一个主 Agent 的可配置流程，而非每节点独立模型调用。规则文本指导语义判断；能力裁剪、配置验证与只读权限由代码保证。非目标包括可执行用户脚本、任意 MCP 进程安装、生产数据库新增授权，以及将配置节点展示为已执行记录。

## Decisions

1. Workflow 为有序节点列表；每个节点具有稳定 id、名称、启用状态、触发条件、执行规则、查询约束、输出要求、tools 和 mcpServers。管理员可增删、排序。安全底线不可通过规则编辑关闭。
2. 以独立幂等表存储 Agent 版本 workflow JSON 与咨询会话快照，复用现有发布/回滚事务。旧版本由原编排步骤生成默认配置，不覆盖历史数据。发布只影响新咨询，追问读取冻结快照。
3. 管理 API 的版本对象携带 workflow。保存验证唯一 ID、长度、节点数量、已登记只读工具、提供方 MCP 依赖。启用节点能力为版本实际能力并集。
4. 通过 toolbox-llm 的配置 SPI 按底层会话 ID 取得可信装配，SidecarClient 在每轮消息中注入。Claude MCP 过滤和 canUseTool、Codex enabled_tools 共同限制实际能力。系统授权仍是上限，未配置的数据源明确返回不可用。
5. 默认数据库节点要求直接查询已授权目标系统数据，先核对结构，查询失败修正后有界重试；缺失唯一业务标识且无法自行确定才询问。规则次数为模型指令，现有引擎运行限制仍有效，不声称硬执行了每个语义节点。
6. UI 在业务咨询对象下增加流程视图，左侧有序节点、右侧编辑规则与装配，窄屏顺序堆叠。沿用 Agent 管理样式（CONSERVATIVE）。适用 OBJ-01、NAV-01、CTX-01、DENS-01、FEED-01、AI-01、EVID-01、CTRL-01，无例外。

## Risks / Trade-offs

文本触发条件由模型解释，不是确定性状态机；只读与装配由代码约束。单主 Agent 的节点权限并集属于会话级权限，不能声称节点间独立沙箱。原有独立业务版本字段保留兼容。已存在其他任务修改 AgentOneShotRunner，不覆盖其变更。

## Verification and rollback

验证配置拒绝/回环、发布与会话冻结、默认规则渲染、双引擎裁剪和 UI 编辑保存；运行模块测试、前端 typecheck/build、sidecar 检查、完整宿主构建、Forge 门禁与至少 60 秒稳定观察。回滚使用现有 Agent 历史版本；代码回滚保留新增快照表。

参考：[Claude SDK 权限](https://platform.claude.com/docs/en/agent-sdk/permissions)，实际调用权限应由运行时裁决，不能只依赖提示词。
