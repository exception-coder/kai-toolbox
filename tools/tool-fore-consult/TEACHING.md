# Agent 管理中的订单草稿教学 Agent

入口：现有 `/tools/agent-management` → **订单草稿教学 Agent**。后端更新并启动后，幂等初始化脚本会登记 Agent 和首个候选版本。前端沿用现有 Agent 管理菜单，不增加教学工作台。

## 教学目标与能力边界

六块内容是理解和管理智能体的六个维度，不是所有 Agent 都必须实现的六层调用栈。本案例把配置、一次执行的证据和回归结果关联到同一个候选版本，展示“修改配置如何改变行为”。

| 维度 | 本案例实现 | 可编辑内容 |
|---|---|---|
| 输入输出 | 原文、可选上一份草稿；Java record 输出；`order-draft/v1` 契约 | 数量上限 |
| 解析契约 | 系统提示词；缺失保留 null；歧义澄清；显式沿用上一份草稿 | 提示词 |
| 模型与工具 | AgentScope ReActAgent；平台统一 OpenAI 兼容网关；两个模拟 ERP 工具 | 模型、温度、查询工具开关 |
| 执行约束 | 最大轮数、整次调用超时、单实例并发 1、模型请求重试 | 轮数、超时、额外重试、单次输出 Token 上限 |
| 回归评测 | 五个固定样本、独立预期、服务端逐项比较和持久化 | 选择版本和执行模式 |
| 运行观测 | Run ID、版本、执行模式、工具结果、时间线、耗时和供应商返回的 Token | 查看运行及评测历史 |

Java 版本没有使用 Pydantic。本例通过工具参数 Schema 约束模型提议，通过 Java 领域规则生成结构化结果。AgentScope 提供模型和工具循环；订单语义、限额、并发入口、配置存储和评分由应用实现。当前未接入 MCP、Studio、跨服务追踪或生产告警，也没有真实 ERP 写入工具。

## 十分钟演示

1. 选择 v1 和“固定脚本演示”，运行“完整订单”。查看 `A123 / 100 / READY` 草稿，以及 `lookup_sku` → `propose_draft` → Java 校验的记录。
2. 运行脚本回归。默认五个样本应全部通过：完整订单、款号歧义、缺少数量、非法数量、修改数量。
3. 将数量上限改为 50。未保存时不能运行；保存产生新候选版本，不覆盖旧版本。
4. 再次回归，精确匹配率应为 60%。展开失败样本，查看期望 READY、实际 INVALID，理解配置变更造成的行为变化。
5. 切回 v1 重跑，验证旧配置可复现。尝试最大轮数 1，观察 INCOMPLETE，而非把未完成执行当作成功。
6. 配置平台统一网关后切换真实模型，输入自己的订单，或勾选沿用上一份草稿后输入“改成 120 件”。通过真实模型回归比较提示词效果。

固定脚本经过真实 AgentScope 工具循环，但输入限定为内置样本，不调用远程模型，也不证明模型理解能力；提示词、温度和模型选择的效果需通过真实模式验证。脚本模式不伪造 Token 用量。

## 规则、错误与发布

- 模拟目录中 A123 唯一，B200 对应两个颜色。未知款号、缺字段或多个候选返回 NEEDS_CLARIFICATION；数量不在配置范围内返回 INVALID。READY 也只是未提交草稿。
- 修改只携带上一份结构化草稿，不建立长期会话记忆。模型仍可能误读原文，因此草稿需要核对；代码校验只证明字段满足定义的约束。
- 模型失败、超时或达到轮数限制时不保留成功草稿。输入保留在页面，可调整配置或网关后重试。单实例教学入口忙时直接拒绝，不排队。
- 超时按每个 Agent 调用计算；五例回归顺序执行，最坏耗时约为五次调用之和。单次输出 Token 上限不是总费用硬预算；供应商未返回用量时显示“未提供”。
- AgentScope Java 2.0.3 的 `maxRetries` 表示总尝试次数，页面的额外重试次数需加一；不叠加应用层重试。
- 脚本工具请求同时填充 `ToolUseBlock.input` 与 JSON `content`：SDK 使用后者校验参数、前者调用工具，必须一致。
- 评分比较 status、sku、quantity，整例精确匹配后计分，阈值 95%。成绩只属于教学记录，不写生产发布成绩。教学 Agent 的通用创建候选、发布和回滚接口均被拦截；候选由教学配置接口创建。

## 代码与验证入口

- `api/TeachingAgentController`：复用 ADMIN 权限，提供快照、配置候选、试运行和评测接口。
- `domain/teaching/`：输入配置契约、固定样本、订单校验和执行端口。
- `infrastructure/teaching/`：AgentScope 适配、模型、工具及执行记录。
- `service/TeachingAgent*` 和 `repository/TeachingAgentRepository`：版本关联、并发、评分与 SQLite 记录。
- `frontend/src/features/agent-management/teaching/`：现有管理详情内的六个维度。

从仓库根目录使用 Java 21 执行 `mvn -pl tools/tool-fore-consult -am test`；前端执行 `npm run typecheck`、`npm run build` 和 `npx vitest run src/features/agent-management/teaching/TeachingAgentDetail.test.tsx`。测试包含真实框架循环、工具执行、边界、SQLite 幂等/版本、发布限制，以及本地 HTTP 服务模拟的重试与超时，不需要付费模型凭据。真实供应商调用质量仍需配置网关后验证。

本次浏览器验证使用真实管理页面与独立内存 SQLite / Spring 接口，覆盖试运行、版本保存、100% → 60% 回归、错误恢复和 1440 / 375 宽度布局；未替换运行中的主服务。

SDK 基准：[AgentScope Java v2.0.3](https://github.com/agentscope-ai/agentscope-java/releases/tag/v2.0.3)。复用 API 时以锁定版本源码和测试为准。
