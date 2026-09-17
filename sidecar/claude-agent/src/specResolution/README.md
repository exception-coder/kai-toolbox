# Forge Existing Spec Resolution

Forge SDK 和 stdio 均提供 `resolve_specs`、`confirm_spec_resolution`、`check_change_readiness`、`refresh_spec_index`。仅开发工具集注册，受限咨询 SDK 不新增写工具。无需 HTTP 后端、数据库迁移或外部模型密钥。

## 使用

1. Agent 将批量输入拆成原子项，以 `project` 绝对路径、`changeId`、`requestId`、`requirements: [{externalId,text,atomic:true,terms:[]}]` 调用 `resolve_specs`。change 先由官方 OpenSpec 创建。
2. 对每项候选读取完整正文、Scenario 和证据。Graphify 返回来源节点与一跳关联，当前标记 UNVERIFIED；必须核对源码，不能当作业务事实。词法分数只排序，不是概率。
3. 调用 `confirm_spec_resolution`，传相同 context、`resolutionId`、真实 `actor` 及每项 decision。分类为 ADDED/MODIFIED/REMOVED/NEW_CAPABILITY/NO_SPEC_CHANGE，附具体 reason；需要 Delta 时传完整 `requirement` 区块。此处只记录 Agent 决策，不代表用户批准。
4. 将返回 drafts 写入 `openspec/changes/<changeId>/`；运行官方 `openspec validate <changeId> --strict --json --no-interactive`。服务不修改正式规格，也不实现同步/归档算法。
5. 编码/提交前调用 `check_change_readiness`；归档或正式规格更新后调用 `refresh_spec_index {project}`。

## Hook 接入

配置宿主环境 `FORGE_SPEC_RESOLUTION_CLI=<sidecar绝对路径>/dist/specResolution/cli.js`、`FORGE_OPENSPEC_CHANGE=<当前change>`。team-standards 4.5.0 的薄 Hook 通过 stdin JSON 调用此 CLI。默认 warn，真实宿主验证后设置 `TEAM_STANDARDS_SPEC_RESOLUTION_HOOK=block`；故障默认遵从模式，`TEAM_STANDARDS_SPEC_RESOLUTION_FAILURE=warn` 可显式告警放行。

CLI 也接受工具名参数，例如 `node <cli> refresh_spec_index`。解析/确认写入 `.forge/spec-resolution/` 审计，检查与刷新只读。不要提交本机审计或手改其状态来绕过门禁。锁冲突需重试；遗留锁先确认没有活动写进程。正式规格内容摘要包括未提交变化，旧确认因此失效。

## 边界与验证

第一版接受 Agent 原子化和具名语义决策，不把词法阈值伪装高置信自动判定；未承诺 Top-3 召回率或准确率。没有显式 `<!-- requirement-id: stable-id -->` 的规格使用标题派生 ID 并告警。并行同目标 Delta 保守阻断；复杂一对多映射先拆分原子项。变更文档采用标准 OpenSpec spec-driven 布局；自定义外部 planning store 尚不支持。

候选索引每次从正式文件取内容摘要，Graphify 进程内缓存按 mtime/size 更新。单 spec 4 MiB、图谱128 MiB、需求50项、候选Top5，超限明确失败。目录与文件 symlink 拒绝。readiness 只证明确认与 Delta 一致，不验证自然语言原子性、业务语义、代码范围或测试结果。

隔离编译：在 sidecar 目录运行 `node node_modules/typescript/bin/tsc --project tsconfig.json --outDir .test-spec-resolution`，再运行 `node --test .test-spec-resolution/specResolution/*.test.js`。测试包含真实 stdio 握手与工具调用，不替代现有服务新版本启动验收。正常构建/安装后 MCP 新会话可加载；本次未触发服务重启或更新已安装插件缓存。
