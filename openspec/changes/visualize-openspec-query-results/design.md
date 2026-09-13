## Context

OpenSpecBoardService.loadChange 已调用 list/status/instructions apply JSON。当前页面遗漏材料状态，固定五列导致完成项横向隐藏。用户要求可视化官方指令结果。

## Goals / Non-Goals

展示完整任务、已完成和剩余数量、材料状态及前置缺口。保持只读，不解析 Markdown、不翻译或虚构任务含义、不把规划完成视为运行通过。

## Decisions

复用 OpenSpecCliGateway 的参数化执行与 JSON adapter。ChangeDetail 新增类型化 workflow 投影，包含 apply state、missingArtifacts/missingPrerequisites、status artifacts。缺失字段标为未知，允许自定义 artifact id；不额外调用 CLI。

前端使用进度条、始终可用的筛选和完整任务行。TaskInspector 展示材料状态，任务证据独立展示。维持原 URL、刷新和错误恢复；后端未升级时显示材料状态尚未返回。

## Risks / Trade-offs

官方版本差异通过可选字段兼容；历史缓存同时保留 workflow 和过期标记。任务内容保留官方原文，不能由标题推断业务目的。

## Migration Plan

修改 OpenSpecBoardView、OpenSpecBoardService.loadChange/stale 和前端 TaskBoard/TaskInspector/OpenSpecBoardPage。无数据库迁移。回滚本切片即可。验证 JSON 投影和缺失字段、任务筛选与完整内容、前后端构建、质量门禁和实际新版稳定观察。浏览器此前被拒绝，视觉核验仍需明确未验证。

## Open Questions

无阻塞设计选择。Graphify 初始化验收属于独立未完成切片，不计入本次完成状态。

## Runtime evidence recovery

接口登记实际触发 JDBC4ResultSet.getObject 的 Bad value for type Long，坐标 SessionAffectedApiRepository:37。未验证条目的 verified_at 为 SQL NULL；改为 JDBC getLong/wasNull 保留空值，加入 SQLite 真实回归。此修复恢复看板关联证据读取，无 DDL/DML 迁移。
