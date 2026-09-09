## Why

当前需求进度分析依赖单段 Prompt 将 PRD、开发文档和源码检查混合推理，虽然已有源码证据校验，但缺少稳定 Agent 身份、OpenSpec 任务事实源和可回归的版本治理，容易把“报告写得完整”误当成“需求真实完成”。现在需要将其升级为可追溯、可治理、可重复评测的正式 Agent。

## What Changes

- 抽象“需求进度分析 Agent”，固定结构化输入、证据优先级、能力白名单、输出契约和服务端确定性校验。
- 以显式绑定的 OpenSpec change/tasks 作为计划与完成边界；无绑定时保留源码核查，但明确降级为非权威评估。
- 编排 URL/项目映射、Graphify 导航、源码与测试读取、Git/质量证据，禁止仅凭 Prompt 自报完成。
- 将需求进度分析 Agent 登记到 Agent 管理模块，支持与业务咨询 Agent 一致的版本、能力、评测和发布治理。
- 将 Agent 管理从单一硬编码条目升级为多 Agent 注册表。

## Capabilities

### New Capabilities

- `requirement-progress-agent`: 定义 OpenSpec 驱动、证据可验证的需求进度分析 Agent 行为。
- `multi-agent-governance`: 定义多个业务 Agent 的注册、选择、版本与评测治理行为。

### Modified Capabilities


## Impact

影响 `tool-prd-clarify` 的进度分析编排、Prompt 与测试，`tool-fore-consult` 的 Agent Registry/版本治理，以及 `frontend` 的 Agent 管理界面。既有进度分析入口保持兼容；Agent 管理新增通用列表与按 Agent 标识访问的 HTTP 接口。
