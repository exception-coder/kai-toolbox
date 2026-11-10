## Why

交付中心按应用组织交付，但独立 OpenSpec 菜单要求用户再次选择工作区，应用身份和任务归属不清。用户已确认将应用清单与应用内需求任务收口到 AI 交付中心。

## What Changes

- 交付中心提供复用项目库系统的应用清单，以及应用内需求与任务入口。
- 源码目录唯一匹配时挂接已有 OpenSpec 查询；缺失或歧义明确提示，不按名称推断。
- 独立看板菜单收起，旧链接跳转到交付中心兼容入口；原需求管理保留独立子路由。
- 既有看板摘要增加 sourcePath 元信息，保持官方 CLI 查询权威。

## Capabilities

### New Capabilities

- `application-delivery-workspace`: 应用清单、应用内任务和旧入口迁移。

### Modified Capabilities

无。

## Impact

reqpool、openspec-board、project-workspace 的公开前端边界；OpenSpecBoardView/Service 摘要响应新增 sourcePath。无数据库变更，无新依赖。复用 visualize-openspec-query-results 的查询实现，不改变其任务事实；既有 unify-requirement-delivery-center 未定义应用身份与工作区挂接，本次独立收口。
