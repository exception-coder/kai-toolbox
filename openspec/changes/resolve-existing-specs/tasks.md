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
