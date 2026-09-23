## 1. Resolver

- [x] 1.1 Implement bounded spec index, evidence retrieval and Graphify association.
- [x] 1.2 Implement idempotent audited decisions, draft and readiness validation.
- [x] 1.3 Add bounded structured model intake, Top-K classification, evidence checks and automatic draft policy.
- [x] 1.4 Validate Graphify referenced source bytes and persist freshness in resolution identity.
- [x] 1.5 Report confirmation-based recall, corrections, automatic mapping agreement and latency with honest sample counts.

## 2. Adapters

- [x] 2.1 Register shared Forge tools in SDK and stdio; provide JSON CLI.
- [x] 2.2 Implement thin configurable write/commit hooks and workflow documentation.
- [x] 2.3 Bind host sessions to project/branch/change; validate write files and actual Git staged scope.
- [x] 2.4 Install independent CLI runtime and team-standards 4.6.0 from a clean release snapshot.

## 3. Verification

- [x] 3.1 Run sidecar typecheck and focused resolver/MCP tests, including failures and stale/conflicting inputs.
- [x] 3.2 Run hook integration and plugin contract checks; validate OpenSpec.
- [x] 3.3 Run project Forge quality CLI and report actual static/runtime evidence.
- [ ] 3.4 After explicit service restart approval, verify running target version and observe stability. Keep pending until authorized.
- [x] 3.5 Verify actual Codex model classification, batch atomization and bounded fallback; Claude verification omitted at user request.
- [ ] 3.6 Verify installed hooks trigger in a fresh real host task before enabling block by default.
- [ ] 3.7 Calibrate 95% recall / 98% accuracy / duplicate capability rate using independently labeled project outcomes; small smoke samples do not establish these targets.

## 验证证据与交付边界

## 4. 按影响执行

- [x] 4.1 增加无需 changeId 的探索与具名影响判定，复用既有规格及 Graphify。
- [x] 4.2 分离行为、设计和验证影响，默认共享分支、单写入会话，接入权限回调与薄 Hook。
- [x] 4.3 实际运行适用验证并绑定内容摘要，拒绝缺失类别、过期结果及暂存/工作区不一致。
- [x] 4.4 调整 Team Standards 的触发规则与旧治理分流，保留行为变化的 Delta 链路。
- [x] 4.5 隔离编译、Forge/Codex/stdio 回归及真实 Hook→CLI 联调；保持第 3 节运行与宿主验收待办。

本轮验证：Forge/Codex 相关 66 项通过，最终分支/执行/stdio 专项 12 项通过；插件全量 241 项中 240 通过、1 跳过、0 失败。真实临时 Git 项目跨仓 Hook→CLI：范围内写入 0、擅自建分支 2、无验证提交 2、验证且暂存后 0、输入改变后 2。独立编译产物为 `.release-spec-resolution-4.7.0`。Forge Quality 仍为静态 executedCheckers 空、9 个旧服务 API 200，通过不代表新服务部署。自动并行分支分配不在本轮实现范围；额外分支由宿主明确分配。

## 前序验证记录

- TypeScript 全 sidecar 隔离编译通过；规格与真实 stdio MCP 21 项通过，相邻工具权限/注册回归 10 项通过。包含 Codex 进程约束、结构化协议、模型超时、伪造证据、并发上下文、源文件内容哈希、提交范围和指标空分母。
- Hook 全量 239 项：238 通过、1 跳过、0 失败；含隔离 Codex CLI 安装。日志为插件仓库 `.logs/spec-resolution-4.6-hooks.log`。
- 真实临时 Git 项目验证 Hook → Forge CLI：未确认返回 2，确认范围内返回 0，范围外返回 2。
- OpenSpec 严格校验、插件引用、共享契约、三 manifest 4.6.0、套件总览与 Skill 审计通过；本机插件 installed/enabled=true，199 个载荷文件与干净快照一致。
- Forge CLI `verify -Phase all` 返回 PASSED，staticStatus=PASSED 但 executedCheckers 为空；运行执行 9 个 API-RUNTIME-001，均验证旧服务。新增能力的静态证据为 tsc，运行证据为隔离单元/stdio/跨仓调用；不可将旧服务结果冒充新部署验收。
- Codex 真实三项分类为 MODIFIED / ADDED / NO_SPEC_CHANGE，符合预期，约 25.8 秒；首项为 AUTO_DRAFT，未自动确认。12 条混合输入拆成 13 个原子项，原文全覆盖，约 20.3 秒；“删除借用并保留历史”正确拆成两个独立行为。初始评估误要求输出恰为 12，已改为核验原文完整覆盖与真实原子性，并保留该断言修正记录。
- 默认模型预算计入检索耗时后，真实 Codex 超时降级 5 次均保留候选，4107–4138ms，样本 P95=4138ms。这只证明本机小样本降级耗时，不证明完整语义解析 P95 或生产质量目标。证据位于 `.tmp/spec-resolution-codex-{live,intake,budget}.json`。
- 新版 CLI 从 `.release-spec-resolution-4.6.0` 注册到本机用户 runtime 配置，未替换现有 sidecar；后端 PID 41412、frontend 57100 等保持原状态，restarts=0。任务 3.4/3.6 保持待验收；change 不归档、不晋升主规格。设计扫描 DESIGN_SCAN_LIMIT 已记录，定向维护本模块，未宣称完整基线治理通过。

## 5. 执行层与宿主适配分层

- [x] 5.1 将执行 contracts/context/policy/service/verification/guard 分离为相邻模块，保持旧工具名和状态格式。
- [x] 5.2 增加只读 session_init 和 resolve_execution_context，区分能力、授权、宿主覆盖及任务引用。
- [x] 5.3 Forge 统一 WRITE/COMMIT/STOP/GIT 决策，插件 v2 消费返回结果，隔离 v1 私有状态兼容。
- [x] 5.4 精简 Skill 主流程并同步唯一架构、接口、维护导航和升级边界。
- [x] 5.5 完成最终跨仓 Hook→CLI 联调、相关回归和两仓提交。
- [ ] 5.6 安装目标版本并在 Codex/Claude 新会话记录 SessionStart/写前/Stop 真实事件；未经运行验证不启用默认 block。

## 6. 稳定性与增量兼容

- [x] 6.1 Readiness 按当前 resolution 的 Delta 子集校验，兼容同一 Change 多批次顺序迭代并保留重复/并行冲突门禁。
- [x] 6.2 分类冲突、重复 Requirement 与证据输入限制返回可定位对象及恢复动作。
- [x] 6.3 运行规格解析、执行层、MCP 回归、测试内置 TypeScript 全量编译、OpenSpec 严格校验与 Forge 质量门禁。
- [ ] 6.4 经用户确认重启 Sidecar 后生成生产 `dist` 并完成目标版本运行验收；当前构建器因 18890 端口仍在使用而保护现有产物。
- [x] 6.5 修复 `execution-writer` 陈旧锁：仅对已验证、已提交、同分支且范围干净的完成执行进行原子回收，保留审计并覆盖拒绝路径回归。

纯只读入口不写项目状态；taskId 仅引用已有任务，不新增 Task 数据库或调度器。服务重启与真实宿主加载仍按第 3 节待办和授权边界执行。

5.x 验证：全 sidecar TypeScript 隔离编译通过；`TEAM_STANDARDS_TEST_HOOK_ROOT` 指向插件源码运行 execution、specResolution、codexAppServer、codexMcpPolicy 测试，共 69 项通过、无跳过。真实临时 Git 项目的 Hook→CLI 覆盖只读启动、范围、分支、无验证 Stop/提交、验证后放行和输入失效。插件全量 245 项中 244 通过、1 原有跳过、0 失败；严格 OpenSpec、引用、三 manifest 4.8.0、Skill 审计与 UTF-8 Skill 校验通过。原始本地日志：`.tmp/execution-plane-tests.log`；插件 `.logs/execution-plane-hooks.log`。

Forge Quality all 返回 PASSED，但 executedCheckers 为空，9 个 API-RUNTIME-001 仅验证当前旧服务。新增代码的实际证据是独立编译、stdio 和跨仓进程调用；未重启服务、未修改当前 runtime 指针、未安装/重载新会话，不宣称 5.6 完成。内容审阅为本次 Codex Agent 的源码与场景核对（AGENT_REVIEWED），不是人工验收。首次 Python Skill 校验受 Windows 默认 GBK 解码影响，显式 `-X utf8` 后通过，无需修改 Skill 内容或检查器。
