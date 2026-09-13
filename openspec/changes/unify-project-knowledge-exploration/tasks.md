## 1. Implementation

- [x] 1.1 Reuse validated domain evidence collection and safe scoped storage; implement bounded topology exploration and API.
- [x] 1.2 Add unified readonly MCP query with compatibility, source attribution and bounded failures.
- [x] 1.3 Unify project knowledge UI, remove taxonomy bootstrap flows, retain Graphify controls and registration recovery.

## 2. Verification and delivery

- [x] 2.1 Verify backend success, failure, freshness, selection and citation contracts; verify MCP readonly and partial failures; verify frontend states.
- [x] 2.2 Build affected modules and host, run project gate, browser checks and at least 60 seconds runtime observation.
- [x] 2.3 Review scoped diff, update evidence and create local commit without unrelated staged changes.

## Evidence

- Backend: `mvn -B -pl tools/tool-projects -am -Dtest=DomainExplorationTest,TopologyExplorationServiceTest -Dsurefire.failIfNoSpecifiedTests=false test`，20 项通过；测试使用受控 Agent 输出验证完整取证与发布流程，没有对真实业务项目执行付费语义探索。
- Frontend: KnowledgeGraphCard、ProjectKnowledgeEntry、SystemDomainsPanel、TopologyKnowledgePanel 共 13 项通过；typecheck 与完整 build 通过，详情导航文案修改后再次 typecheck/Vite build 通过。
- MCP: knowledgeQuery、knowledgeMcp、codexSecurity 共 21 项通过；真实 stdio `knowledge_query(list_projects, all)` 两库返回 OK，reload 请求返回拒绝。
- Host: 42 模块 install 通过。并行打包导致目标 JAR 损坏，删除明确的生成 JAR 后完整重建成功；源码及知识内容未删除。
- Forge CLI `verify -Project . -Format json`：退出码 0，status/runtimeStatus=PASSED，9 项 API-RUNTIME-001 实际执行。staticStatus=PASSED，但 executedCheckers 为空，不能据此宣称静态检查已执行；静态证据来自独立 typecheck、架构检查与编译。
- Runtime：新 JVM 8428（2026-09-12 22:16:30 -07:00），后端 18080、Vite 5173、Studio 3000 连续观察 87.337 秒，三次进程身份、重启次数和 HTTP 响应一致；新增拓扑 GET、领域 GET、登记表和工作目录接口均 200，两种非法启动均 400 且未改快照。观察期间日志无致命异常。
- Browser：桌面 1280px 与窄屏 390px 通过；跨项目选择前禁用启动，选中后可启动，窄屏无页面横向溢出。详情与内嵌入口共用登记身份，51 个模块正常显示。未在真实业务项目启动语义探索。
- 已恢复的启动问题：旧 JVM 85072 脱离守护进程仍占用端口，核对项目归属后终止并重新启动。已有微信运行依赖缺失及 Ollama 不可达仍单列，不属于本次知识探索验收范围。
