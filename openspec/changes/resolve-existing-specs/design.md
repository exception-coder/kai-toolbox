## Context

`toolboxMcpBridge.ts` 与 `forgePendingSql.ts` 分别承载 stdio/SDK Forge 工具。现有 `graphifyMcpBackend.ts` 提供图查询，正式规格仍是行为权威。team-standards 的 write-guard-dispatcher 负责写前分发，不能复制解析算法。图谱已过期，定位结果经定向源码核对。

## Goals / Non-Goals

目标：原子需求逐项召回、具名确认、幂等审计、新鲜度与 Delta 防重复、薄 Hook。非目标：替代 OpenSpec 生命周期、创建向量平台、自动批准不确定语义、HTTP 项目管理界面。

## Decisions

在 sidecar 新建 specResolution feature，文件系统适配、索引、召回、决策、readiness 与工具契约分离。MCP 与 stdin JSON CLI 共用服务；Hook 通过宿主配置的 Node CLI 调用，不把 Forge 路径写入通用插件。

采用有界全文与中文二元词召回、Graphify 节点一跳关联，输出完整候选 Requirement 和排序证据。可选结构化模型调用完成原子化、Top-K 比较与分类；默认 4 秒 deadline，最多显式等待 60 秒。默认 Codex 临时 CLI 进程，使用 ephemeral、隔离目录、只读沙箱，忽略用户配置/规则并关闭 Shell、插件、MCP、Apps、浏览器、多 Agent；仍复用本机认证。FORGE_SPEC_ENGINE 可选择 Claude，其 SDK 显式禁用工具、MCP、插件、项目设置与持久会话。失败、超时、非法结构或伪造引文均显式降级。配置依据 <https://learn.chatgpt.com/docs/config-file/config-reference> 和 <https://code.claude.com/docs/en/agent-sdk/structured-outputs>；本地 Codex 0.153.4 CLI help 验证 ephemeral/ignore-user-config/output-schema，项目仍做 Zod 与业务不变量二次验证。

置信度至少 0.85、领先至少 0.12、非歧义且目标具备逐字规格证据时，既有目标可以输出 AUTO_DRAFT；不自动确认、不写规格、不直接放行。ADDED、NEW_CAPABILITY 与无证据项保持 NEEDS_CONFIRMATION。置信度是未经生产校准的模型估计；Agent 最终记录具名决策与具体 implementationFiles。文本原子化保留 sourceQuote，需审阅完整性后声明 atomic=true。

Graphify manifest 使用 detect._md5_file 的原始字节 MD5；逐项核对选中节点与 changedFiles，拒绝越界、符号链接、缺失、超限、hash 不符或过期语义哈希。VERIFIED_SOURCES 只证明本次证据来源文件，不能宣称整个图谱完整或推断边正确。STALE/UNVERIFIED 不参与加权；图谱证据与来源版本进入解析身份。修改来源后旧 readiness 失效。

resolve_specs 可将 sessionId 映射到 project/branch/change，Hook 使用会话专属指针，避免全局 change 串用。显式本机安装器发布 CLI 路径，不改变服务生命周期。提交检查主动读取 Git 暂存区，范围外可执行文件阻断；内容与 Tasks 的语义一致性仍需审阅。指标从真实确认与纠正记录计算，空分母为 null，不用测试 mock 冒充生产准确率。

解析记录位于项目 `.forge/spec-resolution/`，只保存审计与可再生索引，不复制第二套规格权威。以内容摘要检测工作区未提交变化；分支及项目路径绑定；同一 change 的新输入使旧确认失效。采用排他锁与原子替换；路径拒绝 traversal、symlink、超限输入。显式 Requirement ID 优先，缺 ID 用标题派生并告警。

只输出 Delta 草稿；MODIFIED 必须由 Agent 提交完整正文及 Scenario，readiness 对比确认正文与实际 Delta。NO_SPEC_CHANGE 必须有理由，不生成空 Delta。并行同目标修改保守阻断并提示协调，不假装能自动判断语义冲突。归档后 reindex 生成新摘要，旧解析不会自动变为有效。

## Risks / Trade-offs

- 缺少模型认证时保留候选及明确失败，不承诺专家建议的生产召回率/准确率；需独立标注样本校准。
- Graphify 缺失/过期仅作诊断与定位，不可作为自动业务结论；返回来源与新鲜度。
- Hook 无法保证任意 Shell 写文件都受拦截，宿主支持与 CI 接入分别验收。默认 warn，block 时故障关闭，配置可切换告警。
- 通用设计扫描达到 1000 文档上限，定向读取 docs/INDEX 与既有主规格；当前不宣称完整基线治理通过。

## Migration Plan

隔离编译和单元/stdio/Hook 契约测试后提交。保留当前进程；重启并接入真实宿主后再标记运行验收。回滚为撤销工具注册及 Hook 配置，审计文件保留。

## Review

Codex Agent 自审：接受专家建议的职责划分、防重复与证据要求；将数据库/HTTP 平台方案调整为现有本地 MCP 架构，不新增远端服务。业务批准与 Agent 决策分开标记，不伪造人工确认。
