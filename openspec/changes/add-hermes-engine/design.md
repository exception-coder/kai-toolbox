## Context

官方仓库 NousResearch/hermes-agent 在 `b2c6bc4e1e183263907cf81cf070aa8ebdd5a553` 的 acp_adapter/entry.py、server.py、gateway_server.py、modes.py 和 permissions.py 提供 ACP stdio 与精确 load。当前版本 ACP viewer 可委托 gateway 后台执行，关闭 viewer 不是取消凭据。依据：[官方ACP文档](https://github.com/NousResearch/hermes-agent/blob/b2c6bc4e1e183263907cf81cf070aa8ebdd5a553/website/docs/user-guide/features/acp.md)。采用 L3 最小规格，保护新引擎权限、生命周期和跨恢复幂等边界。

## Decisions

不引入新 ACP SDK 或通用 Agent 框架。本地小型 JSONL RPC 适配只承载当前所需方法，限定行长、回复、RPC和轮次超时；未知客户端方法明确拒绝，未声明文件与终端宿主能力。官方原生工具继续由 Hermes 执行，原生 stderr 不发浏览器。

HERMES_CLI_PATH 选择官方二进制并追加 acp；HERMES_PYTHON_PATH 优先选择原生虚拟环境解释器执行 -m acp_adapter。无 Shell、参数拼接、自动安装或登录，不复制 Forge/Codex 认证。探活仅 initialize，须协议1、hermes-agent 身份与 loadSession；握手不证明账号、模型和 gateway 就绪。

首版跟随原生模型，不伪造目录/强度/速度。权限只映射 default 与 accept_edits；dont_ask 只对应文件编辑策略，不映射全工具绕过。原生审批转现有 Permissions，允许时只选当前请求声明的 allow_once；受限会话、显式模型覆盖与图片输入拒绝，不静默降级或丢弃。原生 MCP/插件工具属于原生环境，本次不注入 Forge MCP，也不声明子 Agent 或后台任务生命周期能力。

精确 session/load 不存在即失败，不使用 latest/resume 的隐式重建；回放阶段不转发旧回复。原生ID写入既有会话身份。发送前原生ID的SHA256在用户私有目录以wx建立标记，已有标记在原生load或设置前拒绝，防并发和崩溃重放。只有合法 prompt 终态才解除；未发送的初始化失败可解除自己取得的标记。未知结果保留并要求原生核对，不能换新ID重试。

取消发送 session/cancel 并等待原 prompt 的终态；10秒未确认或15分钟轮次超时按未知失败，不以关闭viewer冒充成功中断。guard跨进程保留，用户确认原生任务已停止后才人工清理。此标记仅保护Forge发出的轮次，不监控原生后台委派。usage可能累计，首版不按本轮累计入账。

## Principles and verification

OBJ-01/CTX-01 继承项目与会话；CTRL-01 明确原生审批、取消和未知边界；IDEM-01 精确身份及持久标记；EVID-01/FEED-01 区分适配、握手、账号运行及部署。无原则例外。同步整体架构正文与细化Mermaid，通用draw.io职责节点仍适用。

定向验证RPC、模式、审批、恢复、流式结果、取消、未知标记与目录准入，回归Codex配置和前后端身份。真实首次回复、恢复、批准和停止需已安装的Hermes及账号；本次不自动重启服务。
