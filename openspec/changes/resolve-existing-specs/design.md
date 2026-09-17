## Context

`toolboxMcpBridge.ts` 与 `forgePendingSql.ts` 分别承载 stdio/SDK Forge 工具。现有 `graphifyMcpBackend.ts` 提供图查询，正式规格仍是行为权威。team-standards 的 write-guard-dispatcher 负责写前分发，不能复制解析算法。图谱已过期，定位结果经定向源码核对。

## Goals / Non-Goals

目标：原子需求逐项召回、具名确认、幂等审计、新鲜度与 Delta 防重复、薄 Hook。非目标：替代 OpenSpec 生命周期、创建向量平台、自动批准不确定语义、HTTP 项目管理界面。

## Decisions

在 sidecar 新建 specResolution feature，文件系统适配、索引、召回、决策、readiness 与工具契约分离。MCP 与 stdin JSON CLI 共用服务；Hook 通过宿主配置的 Node CLI 调用，不把 Forge 路径写入通用插件。

第一版采用有界全文与中文二元词召回、Graphify 节点一跳关联，输出完整候选 Requirement 和排序证据；排序分数不是置信度。调用 Agent 使用闭合枚举提交语义判断与理由，低置信、新能力需要显式决策；不通过正则猜测无限自然语言。原子项保留 externalId 与原文，明确声明 atomic。

解析记录位于项目 `.forge/spec-resolution/`，只保存审计与可再生索引，不复制第二套规格权威。以内容摘要检测工作区未提交变化；分支及项目路径绑定；同一 change 的新输入使旧确认失效。采用排他锁与原子替换；路径拒绝 traversal、symlink、超限输入。显式 Requirement ID 优先，缺 ID 用标题派生并告警。

只输出 Delta 草稿；MODIFIED 必须由 Agent 提交完整正文及 Scenario，readiness 对比确认正文与实际 Delta。NO_SPEC_CHANGE 必须有理由，不生成空 Delta。并行同目标修改保守阻断并提示协调，不假装能自动判断语义冲突。归档后 reindex 生成新摘要，旧解析不会自动变为有效。

## Risks / Trade-offs

- 词法召回不是语义模型，未知/相近候选均需 Agent 审阅；不承诺专家建议的召回率指标。
- Graphify 缺失/过期仅作诊断与定位，不可作为自动业务结论；返回来源与新鲜度。
- Hook 无法保证任意 Shell 写文件都受拦截，宿主支持与 CI 接入分别验收。默认 warn，block 时故障关闭，配置可切换告警。
- 通用设计扫描达到 1000 文档上限，定向读取 docs/INDEX 与既有主规格；当前不宣称完整基线治理通过。

## Migration Plan

隔离编译和单元/stdio/Hook 契约测试后提交。保留当前进程；重启并接入真实宿主后再标记运行验收。回滚为撤销工具注册及 Hook 配置，审计文件保留。

## Review

Codex Agent 自审：接受专家建议的职责划分、防重复与证据要求；将数据库/HTTP 平台方案调整为现有本地 MCP 架构，不新增远端服务。业务批准与 Agent 决策分开标记，不伪造人工确认。
