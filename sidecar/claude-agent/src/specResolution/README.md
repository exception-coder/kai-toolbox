# Forge Existing Spec Resolution

## 按影响执行

首先 `discover_execution(project, sessionId, request, files)` 探索既有规格、活跃 Change 和 Graphify。读候选原文后 `assess_execution` 记录行为 preserved/changed/unknown、设计 none/detail/architecture、风险类别和逐字引用。preserved 不需要 changeId；changed 复用匹配 Change，继续 resolve/confirm/Delta 链路；unknown 先补证据。设计只绑定受影响层次。

执行保持当前分配分支，一个工作区仅一个写入会话，任务顺序执行并原子提交。`check_execution_readiness` 校验分支、规格版本、文件范围；提交前校验适用设计更新和真实验证。`run_execution_verification` 实际运行已授权 executable/argv 测试，inputFiles 包含测试、配置及依赖；禁止用于服务重启或运行空命令凑 PASS。Windows npm 使用 Node + npm-cli.js 参数数组。缺少类别、失败、内容过期、暂存内容与测试工作区不一致均不能提交。

提交后 `finish_execution` 释放写入权，不自动提交或归档。额外分支由宿主明确分配；不自动生成并行分支或推断任务依赖。中断保留记录与现场，由原会话恢复，不能删除锁抢占。权限回调与 Hook 只覆盖实际触发工具，不是 OS 沙箱。`.forge/verify.yml` 和项目强制门禁仍保留；本入口补充本次影响的原生检查。退出码不证明 kind/purpose 的语义覆盖，也不代表目标版本部署验收。

Forge SDK 和 stdio 均提供 `intake_spec_requirements`、`resolve_specs`、`confirm_spec_resolution`、`check_change_readiness`、`refresh_spec_index`、`get_spec_resolution_metrics`。仅开发工具集注册，受限咨询 SDK 不新增写工具。默认使用本机 Codex 登录；`FORGE_SPEC_ENGINE=claude` 可选择 Claude，`FORGE_SPEC_MODEL` 可指定模型。不另建 HTTP 后端或数据库。

## 使用

1. Agent 可调用 `intake_spec_requirements {text}` 拆分并取得 sourceQuote，审阅完整性后，以 `project`、`changeId`、`requestId`、宿主 `sessionId`、`requirements: [{externalId,text,atomic:true,terms:[]}]` 调用 `resolve_specs`。change 先由官方 OpenSpec 创建。
2. 读取完整候选和证据。Graphify 对选中来源和 changedFiles 核对 manifest 内容哈希，只有 VERIFIED_SOURCES 可以加权；这不证明全图完整。模型默认 4 秒超时，`timeoutMs` 最多 60000；`semantic:false` 只返回本地候选。高置信且逐字证据成立的既有目标返回 AUTO_DRAFT，其余 NEEDS_CONFIRMATION。模型失败保留候选和告警，不自动放行。
3. 调用 `confirm_spec_resolution`，传相同 context、`resolutionId`、真实 `actor`、每项 decision 和明确的 `implementationFiles` 项目相对路径。分类为 ADDED/MODIFIED/REMOVED/NEW_CAPABILITY/NO_SPEC_CHANGE，附具体 reason；需要 Delta 时传完整 `requirement` 区块。此处记录 Agent 决策，不代表用户批准。
4. 将返回 drafts 写入 `openspec/changes/<changeId>/`；运行官方 `openspec validate <changeId> --strict --json --no-interactive`。服务不修改正式规格，也不实现同步/归档算法。
5. 编码/提交前调用 `check_change_readiness`；归档或正式规格更新后调用 `refresh_spec_index {project}`。

## Hook 接入

运行编译目录下 `node <build>/specResolution/install.js`，把 CLI 绝对路径注册至用户目录 `.kai-toolbox/forge-spec-resolution.json`。resolve 的 sessionId 必须使用真实宿主会话 ID；默认取 TOOLBOX_SESSION_ID，Hook 通过 payload.session_id 选择 project/branch/change。也可显式设置 `FORGE_SPEC_RESOLUTION_CLI` 与 `FORGE_OPENSPEC_CHANGE`。薄 Hook 默认 warn，真实宿主验证后设置 `TEAM_STANDARDS_SPEC_RESOLUTION_HOOK=block`；故障默认遵从模式，`TEAM_STANDARDS_SPEC_RESOLUTION_FAILURE=warn` 可显式告警放行。安装器不重启任何服务。

CLI 也接受工具名参数，例如 `node <cli> refresh_spec_index`。解析/确认写入 `.forge/spec-resolution/` 审计，检查与刷新只读。不要提交本机审计或手改其状态来绕过门禁。锁冲突需重试；遗留锁先确认没有活动写进程。正式规格内容摘要包括未提交变化，旧确认因此失效。

## 边界与验证

自动草稿不等于批准。模型分数未经生产校准；`get_spec_resolution_metrics {project}` 从确认/纠正记录报告 Top-3、自动映射一致率、证据率、模型阶段 P95 与样本数，空分母返回 null。该一致率不是独立人工标注准确率；重复 Capability 创建率需真实归档结果，不能由不落盘的草稿推算。没有稳定 ID 的规格使用标题派生 ID 并告警。并行同目标保守阻断；一对多映射先拆分；只支持标准 OpenSpec spec-driven 布局。

Codex 使用隔离临时目录、ephemeral、只读沙箱，忽略用户配置与规则，关闭 Shell、MCP/插件、Apps、浏览器及多 Agent；只传消息证据并校验结构化输出，不读取项目说明。认证仍使用既有 Codex 登录，模型未指定时使用 CLI 默认。工作进程响应 deadline 取消；临时 schema 与结果在退出后清理。Claude 使用工具为空的 SDK 调用；宿主模型流程不等于本次检索模型，实际 engine/model 记录在 semantic 中。

候选索引每次从正式文件取内容摘要，Graphify 进程内缓存按 mtime/size 更新，来源每次核对字节哈希。单 spec 4 MiB、图谱128 MiB、模型输入256 KiB、需求50项、候选Top5，超限明确失败。readiness 校验确认、Delta 与文件绑定；BEFORE_COMMIT 主动读取暂存区。自然语言正确性、Tasks 的业务覆盖和测试结果仍需独立验证。

隔离编译：在 sidecar 目录运行 `node node_modules/typescript/bin/tsc --project tsconfig.json --outDir .test-spec-resolution`，再运行 `node --test .test-spec-resolution/specResolution/*.test.js`。包含真实 stdio、模型策略、哈希、并发及范围测试。模型登录、真实宿主触发与运行服务新版本分别验收，不能由 mock 或旧服务结果替代。
