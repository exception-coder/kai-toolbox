## Why

Agent 管理已有评测页，但真实回归操作位于独立菜单，用户需要在两个入口间切换且丢失题集上下文。将评测收进 Agent 管理形成集中工作台。

## What Changes

- 以 Agent 管理为唯一菜单，提供 Agent 列表及评测中心视图。
- 将现有评测前端归入 Agent 管理 feature，复用样本采集、跑批、报告和退化对比。
- Agent 详情进入评测时带上 Agent 和题集上下文，支持返回、刷新与浏览器历史。
- `/tools/eval` 保留兼容跳转，更新能力探索入口及生成的菜单权限目录。
- 明确现有通用评测不证明候选版本已经通过发布验收。

## Capabilities

### New Capabilities

- `agent-evaluation-workspace`: 统一导航、评测上下文及旧地址兼容。

### Modified Capabilities

无。

## Impact

前端 `agent-management`、`eval`、`forge-explore` 及生成的菜单目录。保持 `/api/eval`、Agent API、数据及后端模块独立，不改发布门禁或执行器。完整候选版本评测及可信结果绑定不属于本次入口集中管理切片，不能将通用运行自动冒认为候选版本发布凭证。

## Evidence and duplicate check

已检查 OpenSpec 活动 changes 与主规格。`optimize-requirement-progress-agent` 涉及多 Agent 治理，`add-agentscope-learning-agent` 涉及教学详情；均不包含统一评测工作台，因此单独建立本 change。

当前坐标：`frontend/src/features/agent-management/pages/AgentManagementPage.tsx`、`frontend/src/features/eval/pages/EvalPage.tsx` 及两个 manifest。Graphify 未完整覆盖 Agent 管理，已由定向源码核对补齐。无未决业务选择。
