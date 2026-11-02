# 实施与验证

基线 3ea760054；已有无关修改 frontend/src/features/claude-chat/pages/ChatPage.sessionConfig.test.tsx 及未跟踪缓存保留。Graphify 查询因图超过 512MiB 安全上限失败，使用定向源码。无服务重启授权。

- [x] 应用原图上传、隔离存储、幂等恢复、过期与配额。
- [x] 受管多模态输入、明确失败及任务追溯；旧文本兼容。
- [x] Forge 三条候选、输出验证与持久查询。
- [x] SDK、OpenAPI、示例、交接与架构说明同步，定向测试及质量门禁。
- [ ] [MANUAL_CONFIRMATION] 目标实例授权加载后真实应用认证、原图模型、重复查询、失败和隔离验收；记录真实 taskId/requestId 及稳定观察。

2026-11-02 本地证据：

- 宿主 reactor：`mvn -pl toolbox-starter -am test "-Dtest=ConsultBackendIntegrationTest,AgentOneShotServiceTest,CodexModelCatalogServiceTest" "-Dsurefire.failIfNoSpecifiedTests=false" -q` 退出 0，覆盖宿主编译及三组定向测试；最后源码/用例收敛后对 fore-consult、claude-chat 及依赖再次定向测试退出 0，分别 22/5/4 项，均无失败或跳过。图片字节断言在 runner/Sidecar 调用边界完成，不是实际模型识图验收。
- `npm test --prefix sdk/forge-consult-client`：17 项通过，含原 WSS 回归及独立应用图文客户端；SDK 0.3.0 打包成功，包内合同、版本、示例与当前源码逐字节一致。
- `openspec validate consult-backend-images --strict` 通过；OpenAPI YAML 解析、44 个本地引用、完整 Image/AnalysisInput/Task 示例的 schema 验证及 CALLER/FORGE 分支反例通过。文档 10 个 JSON 示例、76 个本地链接及受影响 Mermaid 语法通过；未把语法检查称为浏览器视觉验收。
- `forge-quality.ps1 verify -Phase all -Project . -Format json`：退出 0、status PASSED；static executedCheckers 为空，不能声称执行了静态检查器；runtime 实际执行 9 个已有 API 场景，针对当前旧服务，不作为新增接口或真实模型上线证明。
- `git diff --check` 通过。无前端页面变更，不触发页面构建/预览；无人工待执行 SQL，新增表由既有 SchemaInitializer 按随包幂等 schema 初始化，DDL 未核验及基线缺口见 design.md。
- 工作期间其他任务更新了 Vibe Coding 提交及 mobile-codex-quick-presets 记录；不纳入本次提交。未重启、未签发真实凭据、未发送飞书、未修改业务数据，整体运行验收仍待上述人工项。
