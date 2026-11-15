## Context

官方仓库 `zai-org/ZCode` 的 `fec975905a2abd4c07e35c40d51fa097a2258ec9` 包含 CLI 0.17.1，`packages/cli/src/arguments.ts`、`prompt-command.ts` 和 `output-format-stream-json.test.ts` 明确提供 `--prompt`、`--output-format stream-json`、`--resume`、`--mode`。这不是 ACP，也不假定与 Codex App Server 同构。参考 https://github.com/zai-org/ZCode/tree/fec975905a2abd4c07e35c40d51fa097a2258ec9/apps/zcode-cli 。

## Decisions

- 复用 EngineAdapterRegistry、Runtime 目录、当前会话与原有事件，不建独立 Agent 执行器。前后端增加同一个 `zcode` 身份。
- `ZCODE_CLI_PATH` 由运行环境配置为官方 CLI 二进制或已构建 JS 入口；JS 入口由当前 Node 执行。不搜索或安装同名 npm 包，不读取或复制私有授权。CLI 原生账号、模型与插件配置由它自己管理。
- 探活只运行版本及带完整参数的 help，不提交模型任务。help 本身遗漏 output-format 的展示，因此实际让参数解析器校验，而非只搜索帮助文字。探活兼容不等于账号或模型鉴权通过。
- 原生单次 prompt 默认 yolo，Forge 显式映射 default→build、acceptEdits→edit、plan→plan、bypassPermissions→yolo。非交互 CLI 请求的普通批准由其原生 deny broker 处理，不声称有 Forge 逐项审批。普通 plan 是原生模式，不替代咨询工具边界；disabled/review-only/consult-readonly 在启动前拒绝。关闭原生动态工作流，防止将后台工作误判为当前轮完成。
- 只通过绑定原生 ID 恢复，不传 --continue；不确定执行、无最终 result、非零退出和身份不符都不能发布成功。取消后等待所属子进程退出才返回；不以固定超时解锁仍运行的进程。
- 原生 CLI 没有本次已核验的模型选择参数。界面只说明跟随原生配置，不展示假目录或强度/速度；显式非空模型请求在适配器拒绝，不静默丢弃。命令行 prompt 上限 20000 字符，超限明确拒绝，不截断。
- 输出做有界解析，原生 stderr 不进入浏览器。最终 result 与进程退出共同判定完成，流式文本仅代表过程。

## Product principles and verification

OBJ-01 / CTX-01：沿用当前项目和会话入口；FEED-01 / EVID-01：目录兼容、实际模型运行与部署分别报告；IDEM-01：只恢复所属原生 ID；CTRL-01：显式权限映射与受限策略拒绝。无原则例外。运行架构仍是 React→Java→Sidecar Adapter→原生 Harness，通用 draw.io 分层与业务全景的“多引擎”节点不变，正文中的引擎流程补充 ZCode。

验证新适配器异常、取消、身份、结果门禁及目录准入，并回归 Codex 统一配置与通用注册。首次真实轮次、原生登录、连续续接和停止需实际 CLI 与目标版本；未授权不重启服务。
