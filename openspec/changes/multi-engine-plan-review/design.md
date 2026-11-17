# 设计与边界

适用 OBJ-01、NAV-01、CTX-01、FEED-01、EVID-01、CTRL-01、IDEM-01，无例外。

- 主对象为源会话下的一次评审，身份为 sessionId + requestId。每引擎独立任务带 attemptId，完成事件只能写回当前尝试。服务端持久保存引用原文、来源消息标识（仅溯源，不声称服务端核验原文）、关注点、引擎与结果。相同 requestId 复用；参数冲突拒绝。刷新不重复调用模型。
- 回复下新增「多引擎评审」对象动作；同一弹层兼有历史批次与详情，原会话菜单提供返回历史入口。关闭不取消后台任务，切会话关闭弹层，引用结果只追加当前会话草稿。Radix 负责键盘和焦点，移动端满屏可滚动，操作触控不缩小。
- Java 服务负责权限、SQLite 状态、有限并发和恢复；Sidecar 创建独立 Session，复用原生引擎适配器与受限工具策略。源原生句柄不传给评审，不修改源会话引擎或历史。执行适配覆盖 Claude/Codex/Pi/Copilot/Harness/ZCode/Hermes/Qwen/OpenCode；界面完整显示 11 个引擎，Trae、Antigravity 尚未核验全面禁用工具，保留禁用说明。支持集合与普通会话交接集合独立，不能因此扩大往返切换范围。各引擎使用原生默认模型，返回实际报告的模型；未知时明确标注。引用材料是待分析资料，不是工具或外部操作授权。
- 第一轮各引擎互不可见；仅分析本次文字，不能声称已核对仓库或真实运行。保留原文建议，不用投票替代证据。已有 ReviewSpace 是对外共享且固定 Codex，此次复用权限和受限运行机制，独立保存内部批次，不强行创建公开评审对象。
- Java 全局最多三个调用同时执行；超时、断线或重启标记结果未确认/中断，不自动重放。取消阻止迟到结果写入并尽力中断；单项失败可显式重试，其他成功意见保留。每会话限制活动批次，输入/输出有长度上限。
- 单条记录保存批次与子任务 JSON，服务内短临界区串行更新，数据库唯一键约束幂等。运行库 DDL 未核验：prepare_sql_context 返回 DDL_MISSING（9d994f02-5609-40c0-9a35-e90ce2812890），扫描达到上限；Forge 系统无绑定数据库资源。仅依据本仓 SQLite 迁移生成并在内存数据库验证，不写运行库。
- 沿用前轮开源调研：LLM Council 用于独立意见交互参考（作者明确不维护），LangGraph 暂不引入，复用既有 Java/Sidecar 编排。无新增 Python 或模型网关服务。

验收覆盖授权、幂等、并行部分失败、取消/迟到结果、重启恢复、材料不串会话、引用草稿和移动布局。实际模型、浏览器与部署必须单独记证据，入口准备和构建不代表验收完成。

## 2026-11-17 引擎覆盖扩展

复用已安装原生能力，不引入独立编排框架。移动端每项独立触控行，完整显示名称与不可用原因；可同时选择九个受支持引擎，仍由现有全局三并发调度。运行探测只证明原生接口就绪，不证明账号、模型或实际评审成功。

| 引擎 | 原生隔离机制与边界 |
|---|---|
| DeepSeek Harness | 固定 0.2.2-alpha.2 的 `sdk-minimal` 配置，独立 DSH Home，patch 禁用五个工具生产插件；仅 `plan-review:` 身份进入此路径，普通受限策略仍拒绝 |
| ZCode | `app-server --stdio` 新建会话，`toolAllowlist: []`、`mcpServers: []`，关闭工作流与主机增强；返回终态需成功且工具调用数为零 |
| Hermes | 原生 `profiles/forge-review-<attempt-hash>` 复用安装依赖，只投影模型/供应商配置，禁用全部 toolsets、技能与 MCP；ACP 原生创建/取消、未确认执行保护保持不变 |
| Qwen | `safeMode` 保留原生认证及模型配置，禁用用户插件、Hook、MCP 与记忆；显式排除固定 SDK 全部内置工具并以测试核对清单，审批回调一律拒绝 |
| OpenCode | 独占运行实例，工具通配关闭，再读取原生工具目录逐项禁用；目录失败不发送材料，HTTP 请求绑定取消信号，结束关闭实例。源会话自定义网关但未明确原生模型时拒绝，不猜用其他引擎模型 |
| Trae / Antigravity | 当前只读/规划模式仍可能读取文件或调用工具；未核验无工具接口，不以提示词冒充禁用机制，界面说明原因并禁止提交 |

依据为本机固定 SDK 与原生协议源码：Harness `dsh-sdk-minimal/cordis.patch.yml`、ZCode `session/create` 与 `tool-allowlist.ts`、Hermes `session.py` 的 `disabled_toolsets`、Qwen SDK `ToolNames` 与 safe-mode 装配、OpenCode SDK 工具目录及会话 prompt 契约。公开入口：[Harness SDK](https://www.npmjs.com/package/@deepseek-ai/dsh-sdk-client)、[Qwen SDK](https://github.com/QwenLM/qwen-code/blob/main/docs/developers/sdk-typescript.md)、[Trae 参数](https://docs.trae.cn/cli_command-line-parameters)。Antigravity SDK 有策略接口但需要独立 API 凭据，不以它替换现有 CLI 账号或计费。

本轮不更改数据库结构、不执行运行库 SQL。代码适配、模拟验证、真实模型调用和服务部署分别记录在 tasks.md。
