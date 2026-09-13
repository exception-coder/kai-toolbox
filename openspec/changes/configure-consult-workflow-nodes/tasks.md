## 1. Configuration and runtime

- [x] 1.1 Add validated workflow contracts, default nodes and version persistence; test round-trip and invalid input.
- [x] 1.2 Freeze consultation workflow and render configured rules on initial and follow-up dispatch; test version isolation.
- [x] 1.3 Assemble server-owned capabilities through SPI and enforce Claude/Codex restrictions; test removal and system intersection.

## 2. Management and delivery

- [x] 2.1 Add workflow node editor to Agent management with ordering, rules and Tool/MCP bindings; verify browser and interaction tests.
- [x] 2.2 Synchronize usage documentation, run build/test/Forge gates and runtime stability observation, review scoped diff and commit.

## 验收记录（2026-09-13）

- Java 21 受影响模块及依赖测试通过，咨询模块 53 项；前端专项 31 项、Sidecar 185 项通过。前端 typecheck/build、Sidecar build 与完整宿主 Maven 构建通过。
- Forge 完整门禁退出码 0、JSON PASSED，实际执行 9 个运行 API 场景并全部通过；executedCheckers 为空，不将其报告为静态检查已执行。
- 浏览器保存 Candidate v4 并刷新回读六节点、规则及绑定成功；Production 仍为 v1。桌面和 390px 窄屏检查通过，窄屏无横向溢出，临时尺寸已恢复。
- 最终 dev 运行范围为后端 18080、前端 HTTPS 5173、Sidecar 18890。02:38:56 至 02:40:23 连续观察 87 秒，后端 PID 75672、前端 PID 68748、Sidecar PID 87152 均未变化，重启计数未增长；HTTP 200 且 Sidecar WebSocket ping/pong 正常，启动日志无当次致命异常。稳定观察记录见本机 .codex-work/consult-stability-*.json（不入库）。
- 已有 WeChat 服务未就绪、Ollama 嵌入服务不可达，均不属于本次变更范围。未调用真实 LLM 执行业务数据库查询；本次验证覆盖配置持久化、会话快照、运行时权限契约与管理界面。
