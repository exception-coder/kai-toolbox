# 实施与验证

## ITCS 按引用分析原图

- [x] 保存图片 ID、摘要和类型。任务开始时向绑定到当前应用的固定 HTTPS 来源请求原图，校验大小、类型及摘要后交给模型。原图不进入 Forge 附件表。
- [x] SDK 类型、OpenAPI、接入说明与规格同步。SDK 21 项、OpenSpec 和 OpenAPI 解析通过。质量门禁仅执行旧服务的 API-RUNTIME-001。
- [x] Java 31 项集成测试通过。模拟图片源验证执行时取图、原字节进入模型调用、摘要不符时拒绝、没有附件记录以及任务输入不保存原图。
- [ ] ITCS 正式工程接入和真实原图回放。待提供该工程路径，接通其图片读取接口并在目标版本验证。当前未推送、未重启。

## 2026-11-19 图片配额、复用与恢复窗口

- [x] 采用Spring可配置初值256MiB/应用、1GiB/全局；有效图片数量2000/10000，历史元数据独立上限2000/10000及最长30天。四种超限维度返回明确details，不改变单请求限制。
- [x] 新增同应用摘要/媒体类型/有效期查询；SDK 0.5.0先恢复原uploadId、再复用、确定未命中才上传一次。保持超时不重放、过期不复用及跨应用隔离；不改既有uploadId别名语义，不批量删除重复内容。
- [x] 任务接收与图片续期同一事务；默认准入后48小时，上传后最长7天。原requestId查询不续期，失败回滚续期；清理与准入共用单实例锁。旧任务不自动迁移，已清空图片不可恢复，超窗口需新上传。
- [x] 管理员诊断区分有效/过期残留/元数据/近24小时上传/重复占用、清理状态、查询耗时与SQLite文件/WAL/可复用页/磁盘余量；不输出图片、凭据或路径，不执行VACUUM/checkpoint/扩容。
- [x] 宿主及依赖编译、原有及新增29项后端集成测试通过；SDK21项测试通过。SDK0.5.0独立打包与包内版本1.6.0/复用方法检查通过，未发布包仓库。
- [x] 追加配置加载与全局元数据淘汰2项专项通过，合计31项Java测试、21项SDK测试；补充检查使用模块及依赖定向Maven命令，退出0。全量宿主编译沿用前一轮有效证据。
- [x] OpenAPI YAML及49个本地引用解析通过；OpenSpec严格校验及diff检查通过。Forge all JSON PASSED/exit0，executedCheckers为空，仅实际执行API-RUNTIME-001旧服务/api/tools检查，不代表新接口验收。
- [x] node forge.mjs status只读检查：backend/frontend/studio ready，backend PID24912、restarts0；未执行起停。此次为纯后端/SDK，无页面构建或预览。
- [ ] DDL未核验：prepare_sql_context为DDL_MISSING（SQL扫描上限）；Forge未绑定QUERY数据源。依据仓库schema在隔离SQLite验证，尚未核对目标实例实时占用、运行制品或原失败触发维度；新增摘要索引待加载。
- [ ] ITCS正式工程路径及两组原失败样例尚未提供，生产上传流程接线与真实回放待完成。未推送、未重启，256MiB/1GiB是源码初值，未写入私有运行配置或按真实用量定容。

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
