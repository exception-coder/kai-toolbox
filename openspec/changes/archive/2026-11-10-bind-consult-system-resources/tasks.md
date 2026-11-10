## 1. Implementation
- [x] 1.1 Add shared readonly gateway, exact system resolution and runtime session enforcement.
- [x] 1.2 Persist node resource selections and expose resource configuration UI.
- [x] 1.3 Mount resource tools in Claude/Codex using server-owned session context.
## 2. Verification
- [x] 2.1 Test boundaries, persistence, tool assembly and UI; update usage docs.
- [x] 2.2 Build full host, verify runtime/Forge and stability, scoped commit.

## 验证记录

- Java 21 受影响模块与依赖完整测试通过；资源专项复跑通过（只读网关 2 项、咨询资源/签名/HTTP 3 项，以及版本持久化回归）。前端 32 项、Sidecar 187 项通过，前端完整构建通过。
- MCP 子进程测试验证工具发现、会话签名头、查询载荷、写 SQL 在 HTTP 前拒绝，以及 Claude 源码 MCP 不能旁路旧数据库工具。未配置统一资源的旧 Codex 工具清单保持兼容。
- 数据库只读强制执行复用 OpsQueryService.readOnlySqlQuery 和现有 SQL 策略/只读连接；未执行真实业务数据库查询。
- 当前运行数据中资源中心已有连接，但系统绑定为空。交付配置入口和引导，不按连接名称猜测绑定，不自动修改生产 Agent 版本。

- 最终完整宿主构建和 Sidecar 构建通过，dev 后端 18080、前端 HTTPS 5173、Sidecar 18890；03:57:47—03:59:03 连续观察 76 秒，实际监听 PID 分别为 86644、60948、80884，身份和重启计数未变化。HTTP 200、Sidecar ping/pong 正常，缺少签名的资源入口实际返回 403。
- Forge 全量门禁退出码 0、JSON PASSED，9 个 API 运行场景通过；executedCheckers 为空，不能视为静态检查器已运行。构建及专项测试提供补充证据。
- 真实浏览器验证节点资源区、空状态、刷新和资源中心目标地址；桌面与 390px 窄屏无横向溢出，临时视口已恢复。由于实际系统绑定为空，没有伪造资源关联或宣称已完成真实业务查询。
- 当前 WeChat 未就绪及 Ollama 嵌入服务不可达为已有范围外状态；本次服务启动无致命异常。运行日志保留本机 .codex-work/consult-resource-*，不提交缓存与日志。
